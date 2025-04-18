package io.stxkxs.infrastructure.construct.iam;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;

import io.stxkxs.infrastructure.model.iam.IamRole;
import io.stxkxs.infrastructure.model.iam.PolicyConf;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.iam.IPrincipal;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.Role;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

import static io.stxkxs.infrastructure.serialization.Format.id;
import static java.util.stream.Collectors.toMap;

@Slf4j
@Getter
public class RoleConstruct extends Construct {
  private final Role role;

  public RoleConstruct(Construct scope, Common common, IPrincipal principal, IamRole conf) {
    super(scope, id("role", conf.name()));

    this.role = Role.Builder
      .create(this, conf.name())
      .roleName(conf.name())
      .description(conf.description())
      .assumedBy(principal)
      .managedPolicies(conf.managedPolicyNames().stream()
        .map(ManagedPolicy::fromAwsManagedPolicyName)
        .toList())
      .inlinePolicies(inlinePolicies(conf.customPolicies()))
      .build();

    Maps.from(common.tags(), conf.tags())
      .forEach((k, v) -> Tags.of(this.role()).add(k, v));
  }

  public RoleConstruct(Construct scope, Common common, IamRole conf) {
    super(scope, id("role", conf.name()));

    this.role = Role.Builder
      .create(scope, conf.name())
      .roleName(conf.name())
      .description(conf.description())
      .assumedBy(conf.principal().iamPrincipal())
      .managedPolicies(conf.managedPolicyNames().stream()
        .map(ManagedPolicy::fromAwsManagedPolicyName)
        .toList())
      .inlinePolicies(inlinePolicies(conf.customPolicies()))
      .build();

    Maps.from(common.tags(), conf.tags())
      .forEach((k, v) -> Tags.of(this.role()).add(k, v));
  }

  private Map<String, PolicyDocument> inlinePolicies(List<PolicyConf> customPolicies) {
    return customPolicies.stream()
      .map(policy -> {
        var document = PolicyDocument.Builder.create()
          .statements(IamPolicy.policyStatements(this, policy))
          .build();
        return Map.entry(policy.name(), document);
      })
      .collect(toMap(Map.Entry::getKey, Map.Entry::getValue));
  }
}
