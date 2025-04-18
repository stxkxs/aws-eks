package io.stxkxs.infrastructure.model.iam;

import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public record IamRole(
  String name,
  String description,
  Principal principal,
  List<String> managedPolicyNames,
  List<PolicyConf> customPolicies,
  Map<String, String> tags
) {

  public static void addAssumeRoleStatements(Role role, List<Role> principals) {
    Optional
      .ofNullable(role.getAssumeRolePolicy())
      .ifPresentOrElse(
        p -> p.addStatements(
          PolicyStatement.Builder.create()
            .effect(Effect.ALLOW)
            .actions(List.of("sts:AssumeRole"))
            .principals(principals)
            .build()),
        () -> {
          throw new IllegalStateException("AssumeRolePolicy is null for role: " + role.getRoleId());
        });
  }
}
