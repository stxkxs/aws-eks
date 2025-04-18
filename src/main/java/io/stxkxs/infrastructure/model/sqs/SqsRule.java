package io.stxkxs.infrastructure.model.sqs;

public record SqsRule(
  String name,
  String description,
  boolean enabled,
  SqsEventPattern eventPattern
) {}
