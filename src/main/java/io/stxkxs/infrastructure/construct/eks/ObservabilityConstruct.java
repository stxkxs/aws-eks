package io.stxkxs.infrastructure.construct.eks;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.model.cloudwatch.AlarmConf;
import io.stxkxs.infrastructure.model.cloudwatch.DashboardConf;
import io.stxkxs.infrastructure.model.cloudwatch.MetricFilterConf;
import io.stxkxs.infrastructure.model.cloudwatch.ObservabilityConf;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.CfnDashboard;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricProps;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.logs.FilterPattern;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.MetricFilter;
import software.amazon.awscdk.services.sns.ITopic;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.constructs.Construct;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Slf4j
@Getter
public class ObservabilityConstruct extends Construct {
  private final List<MetricFilter> metricFilters;
  private final List<Alarm> alarms;
  private final List<CfnDashboard> dashboards;
  private final Map<String, ITopic> alarmTopics;

  @SneakyThrows
  public ObservabilityConstruct(Construct scope, Common common, String conf) {
    super(scope, id("observability", common.name()));

    var mapper = Mapper.get();
    var parsed = Template.parse(scope, conf);
    var observability = mapper.readValue(parsed, ObservabilityConf.class);

    this.alarmTopics = createAlarmTopics(scope, observability.topics());
    this.metricFilters = createMetricFilters(scope, observability.metrics());
    this.alarms = createAlarms(scope, common, observability.alarms());
    this.dashboards = createDashboards(scope, common, observability.dashboards());
  }

  private Map<String, ITopic> createAlarmTopics(Construct scope, Map<String, List<String>> topics) {
    if (topics == null || topics.isEmpty()) {
      return Map.of();
    }

    return topics.entrySet().stream()
      .collect(HashMap::new,
        (map, entry) -> {
          var topicName = entry.getKey();
          var emails = entry.getValue();

          var topic = Topic.Builder.create(scope, id("alarm-topic", topicName))
            .topicName(topicName)
            .build();

          if (emails != null && !emails.isEmpty()) {
            emails.forEach(email ->
              topic.addSubscription(EmailSubscription.Builder.create(email).build())
            );
          }

          map.put(topicName, topic);
        }, HashMap::putAll);
  }

  private List<MetricFilter> createMetricFilters(Construct scope, List<MetricFilterConf> metricFilters) {
    if (metricFilters == null || metricFilters.isEmpty()) {
      return List.of();
    }

    return metricFilters.stream()
      .map(conf -> MetricFilter.Builder
        .create(scope, id("metric-filter", conf.filterName()))
        .logGroup(LogGroup.fromLogGroupName(scope, conf.filterName() + "-log-group-lookup", conf.logGroupName()))
        .filterPattern(FilterPattern.literal(conf.filterPattern()))
        .metricName(conf.metricName())
        .metricNamespace(conf.metricNamespace())
        .metricValue(conf.metricValue())
        .defaultValue(conf.defaultValue())
        .build())
      .toList();
  }

  private List<Alarm> createAlarms(Construct scope, Common common, List<AlarmConf> alarms) {
    if (alarms == null || alarms.isEmpty()) {
      return List.of();
    }

    return alarms.stream()
      .map(conf -> {
        try {
          var metric = new Metric(MetricProps.builder()
            .namespace(conf.metricNamespace())
            .metricName(conf.metricName())
            .statistic(conf.statistic())
            .dimensionsMap(conf.dimensions())
            .period(Duration.minutes(conf.periodMinutes()))
            .build());

          var alarmBuilder = Alarm.Builder.create(scope, id("alarm", conf.name()))
            .alarmName(conf.name())
            .metric(metric)
            .evaluationPeriods(conf.evaluationPeriods())
            .threshold(conf.threshold())
            .comparisonOperator(ComparisonOperator.valueOf(conf.comparisonOperator()))
            .treatMissingData(TreatMissingData.valueOf(conf.treatMissingData()));

          if (conf.description() != null) {
            alarmBuilder.alarmDescription(conf.description());
          }

          var alarm = alarmBuilder.build();

          if (conf.alarmActions() != null) {
            conf.alarmActions().forEach(topicName -> {
              var topic = this.alarmTopics.get(topicName);
              if (topic != null) {
                alarm.addAlarmAction(new SnsAction(topic));
              } else {
                log.warn("alarm topic {} not found for alarm {}", topicName, conf.name());
              }
            });
          }

          if (conf.tags() != null) {
            Maps.from(common.tags(), conf.tags())
              .forEach((key, value) -> software.amazon.awscdk.Tags.of(alarm).add(key, value));
          }

          return alarm;
        } catch (Exception e) {
          log.error("failed to create alarm: {}", conf.name(), e);
          return null;
        }
      })
      .filter(Objects::nonNull)
      .toList();
  }

  @SneakyThrows
  private List<CfnDashboard> createDashboards(Construct scope, Common common, List<DashboardConf> dashboards) {
    if (dashboards == null || dashboards.isEmpty()) {
      return List.of();
    }

    return dashboards.stream()
      .map(conf -> {
        try {
          var cfnDashboard = CfnDashboard.Builder.create(scope, id("dashboard", conf.name()))
            .dashboardName(conf.name())
            .dashboardBody(conf.body())
            .build();

          if (conf.tags() != null) {
            Maps.from(common.tags(), conf.tags())
              .forEach((key, value) -> software.amazon.awscdk.Tags.of(cfnDashboard).add(key, value));
          }

          return cfnDashboard;
        } catch (Exception e) {
          log.error("failed to create dashboard: {}", conf.name(), e);
          return null;
        }
      })
      .filter(Objects::nonNull)
      .toList();
  }
}