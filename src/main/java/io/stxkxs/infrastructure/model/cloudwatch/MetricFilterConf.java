package io.stxkxs.infrastructure.model.cloudwatch;

import lombok.Builder;

@Builder
public record MetricFilterConf(
  String filterName,
  String logGroupName,
  String filterPattern,
  String metricNamespace,
  String metricName,
  String metricValue,
  Double defaultValue
) {}