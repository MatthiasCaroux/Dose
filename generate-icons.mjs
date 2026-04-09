/**
 * Generates minimal valid PNG icons for the PWA manifest.
 * Uses only Node.js built-ins (zlib + fs) — no external deps needed.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

// ── CRC-32 ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++)
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ── PNG chunk helper ─────────────────────────────────────────────────────────

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length)
  const crcVal = Buffer.allocUnsafe(4)
  crcVal.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([len, typeBytes, data, crcVal])
}

// ── Create a solid-color PNG ─────────────────────────────────────────────────

function createPNG(size, r, g, b) {
  // Raw scanline data: one filter byte (0) + RGB pixels per row
  const rowBytes = size * 3
  const raw = Buffer.allocUnsafe((rowBytes + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0 // filter = None
    for (let x = 0; x < size; x++) {
      const off = y * (rowBytes + 1) + 1 + x * 3
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(size, 0)   // width
  ihdrData.writeUInt32BE(size, 4)   // height
  ihdrData[8] = 8                    // bit depth
  ihdrData[9] = 2                    // color type: RGB
  ihdrData[10] = 0                   // compression
  ihdrData[11] = 0                   // filter
  ihdrData[12] = 0                   // interlace

  const ihdr = chunk('IHDR', ihdrData)
  const idat = chunk('IDAT', deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, ihdr, idat, iend])
}

// ── Write icons ──────────────────────────────────────────────────────────────

mkdirSync('public/icons', { recursive: true })

// Black background (matches theme_color: #000000)
writeFileSync('public/icons/icon-192.png', createPNG(192, 0, 0, 0))
writeFileSync('public/icons/icon-512.png', createPNG(512, 0, 0, 0))

console.log('✓ public/icons/icon-192.png')
console.log('✓ public/icons/icon-512.png')
