package io.stxkxs.infrastructure.construct.sqs;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.model.iam.PolicyStatementConf;
import io.stxkxs.infrastructure.model.sqs.Sqs;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.targets.SqsQueue;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.IPrincipal;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.sqs.Queue;
import software.constructs.Construct;

import java.util.List;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class SqsConstruct extends Construct {
  private final SqsQueue sqs;
  private final List<Rule> rules;
  private final List<PolicyStatement> policies;

  public SqsConstruct(Construct scope, Common common, Sqs conf) {
    super(scope, id("sqs", conf.name()));

    this.sqs = SqsQueue.Builder
      .create(Queue.Builder
        .create(this, id("queue", conf.name()))
        .queueName(conf.name())
        .retentionPeriod(Duration.seconds(conf.retention()))
        .build())
      .build();

    var principals = List.<IPrincipal>of(
      new ServicePrincipal("sqs.amazonaws.com"),
      new ServicePrincipal("events.amazonaws.com"));

    this.policies = conf.customPolicies().stream()
      .map(configuration -> {
        var parsed = Template.parse(scope, configuration.policy(), configuration.mappings());
        return statements(parsed).stream()
          .map(statement ->
            PolicyStatement.Builder.create()
              .principals(principals)
              .effect(Effect.valueOf(statement.effect().toUpperCase()))
              .actions(statement.actions())
              .resources(statement.resources())
              .conditions(statement.conditions())
              .build())
          .toList();
      })
      .flatMap(List::stream)
      .toList();

    this.rules = conf.rules().stream()
      .map(rule -> Rule.Builder
        .create(this, id("rule", rule.name()))
        .enabled(rule.enabled())
        .ruleName(rule.name())
        .description(rule.description())
        .eventPattern(EventPattern.builder()
          .source(rule.eventPattern().source())
          .detailType(rule.eventPattern().detailType())
          .build())
        .targets(List.of(this.sqs()))
        .build())
      .toList();

    Maps.from(common.tags(), conf.tags())
      .forEach((key, value) -> Tags.of(this).add(key, value));
  }

  @SneakyThrows
  private static List<PolicyStatementConf> statements(String parsed) {
    return Mapper.get().readValue(parsed, new TypeReference<>() {});
  }
}
