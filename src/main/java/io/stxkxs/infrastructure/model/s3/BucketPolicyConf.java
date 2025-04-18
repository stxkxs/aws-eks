package io.stxkxs.infrastructure.model.s3;

import io.stxkxs.infrastructure.model.iam.Principal;

import java.util.List;
import java.util.Map;

public record BucketPolicyConf(
  String name,
  List<Principal> principals,
  String policy,
  Map<String, Object> mappings
) {}
