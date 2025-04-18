package io.stxkxs.infrastructure.construct.s3;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.model.iam.Principal;
import io.stxkxs.infrastructure.model.s3.BucketPolicyConf;
import io.stxkxs.infrastructure.model.s3.BucketPolicyStatementConf;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.constructs.Construct;

@Getter
@Slf4j
public class BucketPolicy {

  public static PolicyStatement policyStatement(Construct scope, BucketPolicyConf conf) {
    var s = parse(scope, conf);
    return PolicyStatement.Builder.create()
      .sid(s.sid())
      .effect(Effect.valueOf(s.effect().toUpperCase()))
      .principals(conf.principals().stream().map(Principal::iamPrincipal).toList())
      .actions(s.actions())
      .resources(s.resources())
      .conditions(s.conditions())
      .build();
  }

  @SneakyThrows
  public static BucketPolicyStatementConf parse(Construct scope, BucketPolicyConf conf) {
    var parsed = Template.parse(scope, conf.policy(), conf.mappings());
    return Mapper.get().readValue(parsed, new TypeReference<>() {});
  }
}
