package io.stxkxs.infrastructure.model.kms;

import lombok.Builder;

@Builder
public record Kms(
  String alias,
  String description,
  boolean enabled,
  boolean enableKeyRotation,
  String keyUsage,
  String keySpec,
  String removalPolicy
) {}
