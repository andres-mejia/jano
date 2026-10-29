import { Composition } from "remotion";
import { DURATION, JanoDemo, type JanoDemoProps } from "./JanoDemo";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const RemotionRoot = () => (
  <Composition
    id="JanoDemo"
    component={JanoDemo}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={{ lang: "es" } satisfies JanoDemoProps}
  />
);
