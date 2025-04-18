package io.stxkxs.infrastructure.construct.s3;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.construct.kms.KmsConstruct;
import io.stxkxs.infrastructure.model.kms.Kms;
import io.stxkxs.infrastructure.model.s3.S3Bucket;
import lombok.Getter;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.constructs.Construct;

import java.util.Optional;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class BucketConstruct extends Construct {
  private final Bucket bucket;

  public BucketConstruct(Construct scope, Common common, S3Bucket conf) {
    super(scope, id("bucket", conf.name()));

    var bucket = Bucket.Builder
      .create(this, conf.name())
      .bucketName(conf.name())
      .eventBridgeEnabled(conf.eventBridgeEnabled())
      .versioned(conf.versioned())
      .accessControl(conf.accessControl())
      .objectOwnership(conf.objectOwnership())
      .removalPolicy(conf.removalPolicy())
      .autoDeleteObjects(conf.autoDeleteObjects())
      .lifecycleRules(
        conf.lifecycleRules().stream()
          .map(rule -> LifecycleRule.builder()
            .id(rule.id())
            .enabled(rule.enabled())
            .expiration(Duration.days(rule.expiration()))
            .build()).toList());

    Optional.ofNullable(conf.kms())
      .filter(Kms::enabled)
      .ifPresent(kms -> bucket
        .encryption(BucketEncryption.KMS)
        .encryptionKey(new KmsConstruct(this, common, conf.kms()).key()));

    this.bucket = bucket.build();

    conf.bucketPolicies()
      .forEach(p -> this.bucket().addToResourcePolicy(BucketPolicy.policyStatement(this, p)));

    Maps.from(common.tags(), conf.tags())
      .forEach((key, value) -> Tags.of(this.bucket).add(key, value));
  }
}
