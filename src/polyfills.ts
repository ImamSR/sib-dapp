import { Buffer as NodeBuffer } from 'buffer'
import process from 'process'

const g: any = globalThis as any
if (!g.Buffer) g.Buffer = NodeBuffer
if (!g.process) g.process = process
