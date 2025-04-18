package io.stxkxs.infrastructure.model.s3;

public record BucketLifecycleRule(
  boolean enabled,
  int expiration,
  String id
) {}
