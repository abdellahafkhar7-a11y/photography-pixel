import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sniffVideoSignature,
  verifyVideoSignature,
} from '../functions/_lib/upload-signature.ts'

const ascii = (value: string): number[] => [...value].map((char) => char.charCodeAt(0))

// Minimal, well-formed container headers.
function mp4(brand = 'isom'): Uint8Array {
  return Uint8Array.from([
    0x00, 0x00, 0x00, 0x18,
    ...ascii('ftyp'), ...ascii(brand), 0x00, 0x00, 0x00, 0x00, ...ascii('isom'),
  ])
}
function movLegacy(): Uint8Array {
  return Uint8Array.from([0x00, 0x00, 0x00, 0x14, ...ascii('moov'), 0x00, 0x00, 0x00, 0x00])
}
function webm(): Uint8Array {
  return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88, ...ascii('webm')])
}
function avi(): Uint8Array {
  return Uint8Array.from([...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('AVI '), ...ascii('LIST')])
}
function mpeg(): Uint8Array {
  return Uint8Array.from([0x00, 0x00, 0x01, 0xba, 0x21, 0x00, 0x01, 0x00])
}
function text(value: string): Uint8Array {
  return Uint8Array.from(ascii(value))
}
const zeros = (count: number): Uint8Array => new Uint8Array(count)

// A minimal top-level ISO-BMFF / QuickTime box: 32-bit big-endian size, then
// the 4-character atom name at offset 4.
function qtAtom(atom: string, size = 16): Uint8Array {
  const box = new Uint8Array(size)
  box[0] = (size >>> 24) & 0xff
  box[1] = (size >>> 16) & 0xff
  box[2] = (size >>> 8) & 0xff
  box[3] = size & 0xff
  box.set(ascii(atom), 4)
  return box
}

test('sniff: recognizes reliable video signatures', () => {
  assert.equal(sniffVideoSignature(mp4()), 'mp4')
  assert.equal(sniffVideoSignature(movLegacy()), 'mp4')
  assert.equal(sniffVideoSignature(webm()), 'webm')
  assert.equal(sniffVideoSignature(avi()), 'avi')
  assert.equal(sniffVideoSignature(mpeg()), 'mpeg')
  assert.equal(sniffVideoSignature(text('hello world')), 'unknown')
  assert.equal(sniffVideoSignature(zeros(16)), 'unknown')
  assert.equal(sniffVideoSignature(Uint8Array.from([0x1a, 0x45])), 'unknown')
})

test('valid files are accepted for every supported format', () => {
  const cases: [string, Uint8Array][] = [
    ['video/mp4', mp4()],
    ['video/x-m4v', mp4('M4V ')],
    ['video/quicktime', mp4('qt  ')],
    ['video/quicktime', movLegacy()],
    ['video/webm', webm()],
    ['video/x-matroska', webm()],
    ['video/x-msvideo', avi()],
    ['video/mpeg', mpeg()],
  ]
  for (const [mime, head] of cases) {
    assert.deepEqual(verifyVideoSignature(mime, head), { ok: true }, `${mime} should be accepted`)
  }
})

test('mismatched signatures are rejected', () => {
  const cases: [string, Uint8Array][] = [
    ['video/mp4', webm()],
    ['video/x-m4v', avi()],
    ['video/quicktime', webm()],
    ['video/webm', mp4()],
    ['video/x-matroska', mp4()],
    ['video/x-msvideo', mp4()],
    ['video/mp4', mpeg()],
  ]
  for (const [mime, head] of cases) {
    assert.deepEqual(
      verifyVideoSignature(mime, head),
      { ok: false, reason: 'mismatch' },
      `${mime} vs ${sniffVideoSignature(head)} should mismatch`,
    )
  }
})

test('malformed / truncated / unrecognized headers are rejected', () => {
  const cases: [string, Uint8Array][] = [
    ['video/mp4', text('this is not a video')],
    ['video/mp4', zeros(64)],
    ['video/webm', text('GIF89a')],
    ['video/x-msvideo', zeros(12)],
    ['video/mp4', Uint8Array.from([])],
    ['video/mp4', Uint8Array.from([0x00, 0x00, 0x00, 0x18])],
  ]
  for (const [mime, head] of cases) {
    const result = verifyVideoSignature(mime, head)
    assert.equal(result.ok, false, `${mime} should be rejected`)
    assert.equal(result.ok === false ? result.reason : '', 'malformed')
  }
})

test('mpeg is accepted on its declared type (documented ambiguous signature)', () => {
  // MPEG program streams can begin with several start codes; an unrelated header
  // must NOT be rejected because the signature is not reliable.
  assert.deepEqual(verifyVideoSignature('video/mpeg', text('anything')), { ok: true })
  assert.deepEqual(verifyVideoSignature('video/mpeg', zeros(8)), { ok: true })
})

test('non-video declared types are not signature-enforced (documented limitation)', () => {
  assert.deepEqual(verifyVideoSignature('image/jpeg', mp4()), { ok: true })
})

test('legacy MOV files with QuickTime top-level atoms are accepted', () => {
  // pnot / junk / cmov are valid FIRST atoms in legacy QuickTime .mov files;
  // moov / wide / free / skip / mdat are the box types already supported.
  for (const atom of ['pnot', 'junk', 'cmov', 'moov', 'wide', 'free', 'skip', 'mdat']) {
    assert.deepEqual(
      verifyVideoSignature('video/quicktime', qtAtom(atom)),
      { ok: true },
      `video/quicktime starting with a '${atom}' atom should be accepted`,
    )
  }
})

test('a 64-bit extended box size (size field = 1) is accepted', () => {
  const head = Uint8Array.from([
    0x00, 0x00, 0x00, 0x01,
    ...ascii('ftyp'),
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x20,
    ...ascii('isom'),
  ])
  assert.equal(sniffVideoSignature(head), 'mp4')
  assert.deepEqual(verifyVideoSignature('video/mp4', head), { ok: true })
})

test("'uuid' is not treated as a MOV/MP4 signature", () => {
  // A uuid box can wrap arbitrary payloads, so it is never accepted on its own.
  assert.deepEqual(verifyVideoSignature('video/quicktime', qtAtom('uuid')), {
    ok: false,
    reason: 'malformed',
  })
  assert.deepEqual(verifyVideoSignature('video/mp4', qtAtom('uuid')), {
    ok: false,
    reason: 'malformed',
  })
})

test('a known atom with an implausible box size is rejected', () => {
  // The atom at offset 4 spells 'ftyp', but the box size is 0 (invalid as the
  // first box), so this must not be accepted as a real container.
  const head = Uint8Array.from([0x00, 0x00, 0x00, 0x00, ...ascii('ftyp'), 0x00, 0x00, 0x00, 0x00])
  assert.equal(sniffVideoSignature(head), 'unknown')
  assert.deepEqual(verifyVideoSignature('video/mp4', head), { ok: false, reason: 'malformed' })
})
