package io.stxkxs.infrastructure.model.iam;

import java.util.Map;

public record PolicyConf(
  String name,
  String policy,
  Map<String, Object> mappings
) {}
