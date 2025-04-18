package io.stxkxs.infrastructure.construct.iam;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.model.iam.PolicyConf;
import io.stxkxs.infrastructure.model.iam.PolicyStatementConf;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.constructs.Construct;

import java.util.List;

@Getter
@Slf4j
public class IamPolicy {
  @SneakyThrows
  public static List<PolicyStatement> policyStatements(Construct scope, PolicyConf conf) {
    return parse(scope, conf)
      .stream()
      .map(IamPolicy::policyStatement)
      .toList();
  }

  public static PolicyStatement policyStatement(PolicyStatementConf s) {
    return PolicyStatement.Builder.create()
      .effect(Effect.valueOf(s.effect().toUpperCase()))
      .actions(s.actions())
      .resources(s.resources())
      .conditions(s.conditions())
      .build();
  }

  @SneakyThrows
  public static List<PolicyStatementConf> parse(Construct scope, PolicyConf conf) {
    var parsed = Template.parse(scope, conf.policy(), conf.mappings());
    return Mapper.get().readValue(parsed, new TypeReference<>() {});
  }
}
