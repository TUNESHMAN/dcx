import { Stage } from "@leighton-digital/lambda-toolkit";

export const resourceNameForStage = (
  resourcePrefix: string,
  stage: Stage | string
) => `${resourcePrefix}${stage !== Stage.prod ? `-${stage}` : ""}`;
