package io.stxkxs.infrastructure.model.eks;

import io.fabric8.kubernetes.api.model.ObjectMeta;
import io.stxkxs.infrastructure.model.iam.IamRole;

import java.util.Map;

public record PodIdentity(
  ObjectMeta metadata,
  IamRole role,
  Map<String, String> tags
) {}
