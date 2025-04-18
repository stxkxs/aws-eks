package io.stxkxs.infrastructure.model.eks;

import io.fabric8.kubernetes.api.model.ObjectMeta;
import io.stxkxs.infrastructure.model.iam.IamRole;

public record ServiceAccountConf(
  ObjectMeta metadata,
  IamRole role
) {}
