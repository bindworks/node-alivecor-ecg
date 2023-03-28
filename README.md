# node-alivecor-ecg

Parser of AliveCor ECG File

## How to use

```typescript

import { createAliveCorEcgParser } from 'node-alivecor-ecg';
import * as fs from 'fs';

const file = fs.readFileSync('ecg.atc', { encoding: 'binary' });
const parser = createAliveCorEcgParser();
const parsed = parser.parse(file);

```
