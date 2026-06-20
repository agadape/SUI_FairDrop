import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES } from "./brand";
import {
  HookScene,
  FairDropScene,
  TieBreakScene,
  SeamScene,
  UmbraScene,
  CloseScene,
} from "./scenes";

// Flip to true once recordings exist in public/clips/
//   fairdrop.mp4 · tiebreak.mp4 · umbra.mp4
const CLIPS_READY = false;

// Optional voiceover: drop public/vo.mp3 and set VO = true.
// const VO = false;

export const FairUmbra: React.FC = () => {
  let at = 0;
  const next = (len: number) => {
    const from = at;
    at += len;
    return { from, durationInFrames: len };
  };
  return (
    <AbsoluteFill>
      {/* {VO && <Audio src={staticFile("vo.mp3")} />} */}
      <Sequence {...next(SCENES.hook)}>
        <HookScene />
      </Sequence>
      <Sequence {...next(SCENES.fairdrop)}>
        <FairDropScene clipsReady={CLIPS_READY} />
      </Sequence>
      <Sequence {...next(SCENES.tiebreak)}>
        <TieBreakScene />
      </Sequence>
      <Sequence {...next(SCENES.seam)}>
        <SeamScene />
      </Sequence>
      <Sequence {...next(SCENES.umbra)}>
        <UmbraScene clipsReady={CLIPS_READY} />
      </Sequence>
      <Sequence {...next(SCENES.close)}>
        <CloseScene />
      </Sequence>
    </AbsoluteFill>
  );
};
