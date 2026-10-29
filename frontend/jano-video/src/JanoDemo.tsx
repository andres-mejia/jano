import { AbsoluteFill, Sequence } from "remotion";
import { copy, type Lang } from "./copy";
import { Approval } from "./scenes/Approval";
import { EndCard } from "./scenes/EndCard";
import { Icp } from "./scenes/Icp";
import { Intro } from "./scenes/Intro";
import { Pipeline } from "./scenes/Pipeline";
import { Rules } from "./scenes/Rules";
import { color } from "./theme";

export type JanoDemoProps = { lang: Lang };

/** Solape entre escenas: la siguiente entra con un fundido sobre la anterior. */
const OVERLAP = 12;

const SCENES = [
  { id: "intro", length: 96 },
  { id: "icp", length: 177 },
  { id: "pipeline", length: 222 },
  { id: "approval", length: 222 },
  { id: "rules", length: 117 },
  { id: "end", length: 102 },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

/** Fotograma de inicio de cada escena en la línea de tiempo global. */
export const sceneStart: Record<SceneId, number> = (() => {
  const out = {} as Record<SceneId, number>;
  let at = 0;
  for (const s of SCENES) {
    out[s.id] = at;
    at += s.length - OVERLAP;
  }
  return out;
})();

export const DURATION = SCENES.reduce((sum, s) => sum + s.length, 0) - OVERLAP * (SCENES.length - 1);

export const JanoDemo = ({ lang }: JanoDemoProps) => {
  const t = copy[lang];
  const render = (id: SceneId) => {
    switch (id) {
      case "intro":
        return <Intro tagline={t.tagline} />;
      case "icp":
        return <Icp t={t.icp} />;
      case "pipeline":
        return <Pipeline t={t.pipeline} />;
      case "approval":
        return <Approval t={t.approval} />;
      case "rules":
        return <Rules t={t.rules} />;
      case "end":
        return <EndCard t={t.end} />;
    }
  };
  return (
    <AbsoluteFill style={{ backgroundColor: color.tinta }}>
      {SCENES.map((s) => (
        <Sequence key={s.id} name={s.id} from={sceneStart[s.id]} durationInFrames={s.length}>
          {render(s.id)}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
