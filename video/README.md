# FairDrop + Umbra — demo video (Remotion)

Hybrid: Remotion renders all branded motion + muted-legibility captions; your **live
screen-recordings** drop into `public/clips/`. 5:00 @ 1920×1080, 30fps.

## Quick start

```bash
cd video
npm install
npm start          # opens Remotion Studio — preview every scene live
```

The video renders **immediately**, even with no recordings — empty clip slots show a
"REC SLOT" slate so you can preview timing/captions first.

## Record the 3 live clips

Record at 1920×1080, 30fps (OBS: Settings → Video → 1920×1080, 30 FPS; Output → CBR).
Save into `public/clips/`:

| File | What to capture |
|------|-----------------|
| `fairdrop.mp4` | Commit a sealed bid → simulate device loss → fresh login → recover from Walrus+Seal. The emotional peak. ~70s of usable footage. |
| `tiebreak.mp4` | Resolve a tie → open SuiScan resolve tx → point at `sui::random` / `0x8`. ~30s. |
| `umbra.mp4` | `/umbra`: the Rekt sandwich panel, then submit a live order → hash appears → $0 extractable. ~30s. |

Then flip `CLIPS_READY = true` in `src/Video.tsx`.

> Caption sub-sequence timings in `src/scenes.tsx` assume the clip beats land at certain
> frames. After dropping a clip, scrub in Studio and nudge each `<Sequence from={...}>` so
> captions sit over the right moment. Trim clips with `OffthreadVideo` `startFrom`/`endAt`
> if needed.

## Render

```bash
npm run render     # -> out/fairdrop-umbra.mp4 (H.264, ready for YouTube)
npm run still      # -> out/cover.png (grab a frame for the submission cover)
```

## Voiceover (optional)

Record the script below as `public/vo.mp3`, uncomment the `<Audio>` line + `VO` flag in
`src/Video.tsx`. Or narrate live while screen-recording and skip this.

---

## Voiceover script (timed to 5:00)

**0:00 HOOK** — "Encrypt a secret on-chain today, and one lost device means it's gone
forever — because no server is allowed to hold the key. We removed that rule."

**0:30 FAIRDROP** — "This is the primitive's first policy: a fair launch you can't get
locked out of. Google login, no seed phrase. I commit a sealed bid — invisible to
everyone. Now I lose this device. Fresh browser, same Google login re-derives the same
wallet — and the chain itself decides I'm allowed to recover. Walrus holds the encrypted
secret, Seal releases it. My bid is back. No server ever saw it."

**1:40 TIE-BREAK** — "Two bids tie at the clearing price. Who wins? Not us — Sui's
validator randomness, on-chain at 0x8. Unpredictable, unbiasable, permanent."

**2:10 SEAM** — "None of that was special-cased. Recovery was gated by this — a real
on-chain function the Seal key servers run. Swap the asserts and you get a new
application. FairDrop and Umbra are deployed. Voting and inheritance are one assert away —
not built, just to show how little changes. New policy, same engine."

**2:45 UMBRA** — "Second policy: confidential settlement. A real Cetus sandwich extracted
forty-two dollars from a victim. With Umbra, the order is a thirty-two-byte shadow until
it's too late to attack. Nothing to front-run."

**3:15 CLOSE** — "Every encrypted on-chain secret today is one lost device from gone
forever — that's why nothing that matters lives behind on-chain encryption. We fixed it.
The first two policies are a fair launch and an MEV shield, but the primitive is the
product: any rule you can write in Move can gate a recoverable secret. Seal made secrets
programmable. We made them recoverable. Thank you."
