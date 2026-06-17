import { Composition } from "remotion";
import { FairUmbra } from "./Video";
import { FPS, TOTAL } from "./brand";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FairUmbra"
      component={FairUmbra}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
