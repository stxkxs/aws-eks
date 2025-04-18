package io.stxkxs.infrastructure.construct.cloudwatch;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.construct.kms.KmsConstruct;
import io.stxkxs.infrastructure.model.cloudwatch.LogGroupConf;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupClass;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

import java.util.Optional;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
@Slf4j
public class LogGroupConstruct extends Construct {
  private final ILogGroup logGroup;

  public LogGroupConstruct(Construct scope, Common common, LogGroupConf conf) {
    super(scope, id("log-group", conf.name()));

    var builder = LogGroup.Builder
      .create(this, id("cloudwatch.log-group", conf.name()))
      .logGroupName(conf.name())
      .logGroupClass(LogGroupClass.valueOf(conf.type().toUpperCase()))
      .retention(RetentionDays.valueOf(conf.retention().toUpperCase()))
      .removalPolicy(RemovalPolicy.valueOf(conf.removalPolicy().toUpperCase()));

    Optional.ofNullable(conf.kms())
      .map(k -> new KmsConstruct(this, common, k).key())
      .map(builder::encryptionKey);

    this.logGroup = builder.build();

    Maps.from(conf.tags(), common.tags())
      .forEach((k, v) -> Tags.of(this.logGroup()).add(k, v));
  }
}
