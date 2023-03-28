import { Parser } from 'binary-parser';

export interface AliveCorEcgParser {
  parse(input: Buffer): AliveCorEcg;
}

export interface AliveCorEcgInfo {
  dateRecorded: string;
  recordingUuid: string;
  mobilePhoneUuid: string;
  mobilePhoneModel: string;
  recorderSoftware: string;
  recorderHardware: string;
  deviceData: string;
}

export interface AliveCorEcgFormat {
  ecgFormat: number;
  samplingRateHz: number;
  amplitudeResolutionNV: number;
  polarity: number;
  mainsFrequency: number;
  mainsFilter: boolean;
  lowPassFilter: boolean;
  baseLineFilter: boolean;
  notchMainsFilter: boolean;
  enhancedFilter: boolean;
}

export interface AliveCorEcgAnnotation {
  tickCountFrequencyHz: number;
  ticks: {
    offset: number;
    beatType: number;
  }[];
}

export interface AliveCorEcgLeads {
  leadI: number[];
  leadII?: number[];
  leadIII?: number[];
  aVR?: number[];
  aVL?: number[];
  aVF?: number[];
}

export interface AliveCorEcg {
  fileVersion: '1.6';
  info: AliveCorEcgInfo;
  format: AliveCorEcgFormat;
  leads: AliveCorEcgLeads;
  annotation?: AliveCorEcgAnnotation;
}

export function createAliveCorEcgParser(): AliveCorEcgParser {
  const leadBlockParser = new Parser()
    .endianness('little')
    .array('data', { type: 'int16le', readUntil: 'eof' });

  const annotationBlockParser = new Parser()
    .endianness('little')
    .uint32('tickCountFrequencyHz')
    .array('ticks', {
      type: new Parser()
        .endianness('little')
        .uint32('offset')
        .uint16('beatType'),
      readUntil: 'eof',
    });

  const infoBlockParser = new Parser()
    .endianness('little')
    .string('dateRecorded', {
      length: 32,
      stripNull: true,
      formatter: trimString,
    })
    .string('recordingUuid', {
      length: 40,
      stripNull: true,
      formatter: trimString,
    })
    .string('mobilePhoneUuid', {
      length: 44,
      stripNull: true,
      formatter: trimString,
    })
    .string('mobilePhoneModel', {
      length: 32,
      stripNull: true,
      formatter: trimString,
    })
    .string('recorderSoftware', {
      length: 32,
      stripNull: true,
      formatter: trimString,
    })
    .string('recorderHardware', {
      length: 32,
      stripNull: true,
      formatter: trimString,
    })
    .string('deviceData', {
      length: 52,
      stripNull: true,
      formatter: trimString,
    });

  const formatBlockParser = new Parser()
    .endianess('little')
    .uint8('ecgFormat')
    .uint16('samplingRateHz')
    .uint16('amplitudeResolutionNV')
    .bit1('polarity')
    .bit1('mainsFrequency', { formatter: (f: number) => (f ? 60 : 50) })
    .bit1('mainsFilter', { formatter: convertToBoolean })
    .bit1('lowPassFilter', { formatter: convertToBoolean })
    .bit1('baseLineFilter', { formatter: convertToBoolean })
    .bit1('notchMainsFilter', { formatter: convertToBoolean })
    .bit1('enhancedFilter', { formatter: convertToBoolean })
    .bit1('unused')
    .uint16('reserved');

  interface AliveCorBlock {
    identifier: string;
    length: number;
    contents: Buffer;
    checksum: number;
  }

  const blockParser = new Parser()
    .endianness('little')
    .string('identifier', { length: 4 })
    .uint32('length')
    .buffer('contents', { length: 'length' })
    .uint32('checksum');

  interface AliveCorFile {
    signature: Buffer;
    version: number;
    blocks: AliveCorBlock[];
  }

  const fileParser = new Parser()
    .endianness('little')
    .buffer('signature', { length: 8 })
    .uint32('version')
    .array('blocks', { type: blockParser, readUntil: 'eof' });

  return {
    parse,
  };

  function parse(input: Buffer): AliveCorEcg {
    const parsed = parseFileWithBufferBlocks();
    const info = parseInfoBlock();
    const format = parseFormatBlock();
    const annotation = parseAnnotationBlock();

    if (format.ecgFormat !== 1) {
      throw new Error('Unsupported ECG Format in AliveCor ECG file');
    }

    const leads = [
      ['ecg ', 'leadI'],
      ['ecg2', 'leadII'],
      ['ecg3', 'leadIII'],
      ['ecg4', 'aVR'],
      ['ecg5', 'aVL'],
      ['ecg6', 'aVF'],
    ]
      .map(([type, name]) => ({ name, data: parseLeadBlock(type) }))
      .filter(({ data }) => data)
      .reduce(
        (acc, i) => ({ ...acc, [i.name]: i.data }),
        {} as AliveCorEcgLeads
      );

    return {
      fileVersion: '1.6',
      info,
      format,
      leads,
      ...(annotation ? { annotation } : {}),
    };

    function parseFileWithBufferBlocks(): AliveCorFile {
      const parsed = fileParser.parse(input) as AliveCorFile;
      if (parsed.signature.toString('hex') !== '414c495645000000') {
        throw new Error('Not an AliveCor ECG file');
      }
      if (parsed.version !== 4) {
        throw new Error('Unsupported AliveCor ECG file');
      }
      return parsed;
    }

    function parseInfoBlock(): AliveCorEcgInfo {
      const infoBlock = parsed.blocks.find((b) => b.identifier === 'info');
      if (!infoBlock) {
        throw new Error('No info block in AliveCor ECG file');
      }
      return infoBlockParser.parse(infoBlock.contents) as AliveCorEcgInfo;
    }

    function parseFormatBlock(): AliveCorEcgFormat {
      const formatBlock = parsed.blocks.find((b) => b.identifier === 'fmt ');
      if (!formatBlock) {
        throw new Error('No format block in AliveCor ECG file');
      }
      return formatBlockParser.parse(formatBlock.contents);
    }

    function parseAnnotationBlock(): AliveCorEcgAnnotation | undefined {
      const annotationBlock = parsed.blocks.find(
        (b) => b.identifier === 'ann '
      );
      return annotationBlock
        ? annotationBlockParser.parse(annotationBlock.contents)
        : undefined;
    }

    function parseLeadBlock(type: string): number[] | undefined {
      const leadBlock = parsed.blocks.find((b) => b.identifier === type);
      return leadBlock
        ? leadBlockParser.parse(leadBlock.contents).data
        : undefined;
    }
  }

  function convertToBoolean(bit: number): boolean {
    return bit === 1;
  }

  function trimString(s: string): string {
    return s.trim();
  }
}
