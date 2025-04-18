package io.stxkxs.infrastructure.model.cloudwatch;

import lombok.Builder;

import java.util.Map;

@Builder
public record DashboardConf(
  String name,
  String body,
  Map<String, String> tags
) {}