package io.stxkxs.infrastructure.model.cloudwatch;

import lombok.Builder;

import java.util.List;
import java.util.Map;

@Builder
public record AlarmConf(
  String name,
  String description,
  String metricNamespace,
  String metricName,
  String statistic,
  Map<String, String> dimensions,
  Integer periodMinutes,
  Integer evaluationPeriods,
  Double threshold,
  String comparisonOperator,
  String treatMissingData,
  List<String> alarmActions,
  Map<String, String> tags
) {}