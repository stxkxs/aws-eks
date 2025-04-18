package io.stxkxs.infrastructure.model.cloudwatch;

import io.stxkxs.infrastructure.model.kms.Kms;
import lombok.Builder;

import java.util.Map;

@Builder
public record LogGroupConf(
  String name,
  String type,
  String retention,
  Kms kms,
  String removalPolicy,
  Map<String, String> tags
) {}
