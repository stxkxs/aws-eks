package io.stxkxs.infrastructure.model.cloudwatch;

import lombok.Builder;

import java.util.List;
import java.util.Map;

@Builder
public record ObservabilityConf(
  Map<String, List<String>> topics,
  List<MetricFilterConf> metrics,
  List<AlarmConf> alarms,
  List<DashboardConf> dashboards
) {}