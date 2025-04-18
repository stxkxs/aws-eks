package io.stxkxs.infrastructure.model.iam;

import io.stxkxs.infrastructure.model.eks.PodIdentity;
import io.stxkxs.infrastructure.model.eks.ServiceAccountConf;
import lombok.Builder;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.CfnJson;
import software.amazon.awscdk.services.iam.AccountPrincipal;
import software.amazon.awscdk.services.iam.ArnPrincipal;
import software.amazon.awscdk.services.iam.CompositePrincipal;
import software.amazon.awscdk.services.iam.FederatedPrincipal;
import software.amazon.awscdk.services.iam.IOpenIdConnectProvider;
import software.amazon.awscdk.services.iam.IPrincipal;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.iam.StarPrincipal;
import software.amazon.awscdk.services.iam.WebIdentityPrincipal;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@Builder
@Slf4j
public record Principal(
  PrincipalType type,
  String value,
  String action,
  List<Principal> composite,
  Map<String, Object> conditions
) {

  public IPrincipal iamPrincipal() {
    if (type.equals(PrincipalType.AWS) || type.equals(PrincipalType.ACCOUNT)) {
      var principal = new AccountPrincipal(value())
        .withConditions(this.conditions());
      return maybeComposite(principal);
    } else if (type.equals(PrincipalType.FEDERATED)) {
      var principal = new FederatedPrincipal(value(), this.conditions(), this.action())
        .withSessionTags();
      return maybeComposite(principal);
    } else if (type.equals(PrincipalType.ARN)) {
      var principal = new ArnPrincipal(value())
        .withConditions(this.conditions());
      return maybeComposite(principal);
    } else if (type.equals(PrincipalType.SERVICE)) {
      var principal = new ServicePrincipal(value())
        .withConditions(this.conditions());
      return maybeComposite(principal);
    } else if (type.equals(PrincipalType.STAR)) {
      var principal = new StarPrincipal()
        .withConditions(this.conditions());
      return maybeComposite(principal);
    } else {
      throw new IllegalStateException("unknown principal type " + value());
    }
  }

  public IPrincipal maybeComposite(IPrincipal principal) {
    if (composite == null || composite.isEmpty())
      return principal;

    var p = Stream.concat(
        Stream.of(principal),
        composite.stream().map(Principal::iamPrincipal))
      .toList();

    var compositePrincipal = new CompositePrincipal(p.toArray(IPrincipal[]::new));
    if (conditions() != null) {compositePrincipal.withConditions(conditions());}

    return compositePrincipal;
  }

  public IPrincipal oidcPrincipal(Construct scope, IOpenIdConnectProvider oidc, ServiceAccountConf sa) {
    return new WebIdentityPrincipal(oidc.getOpenIdConnectProviderArn())
      .withConditions(
        Map.of("StringEquals", CfnJson.Builder.create(scope, String.format("oidc-principal-%s", sa.role().name()))
          .value(Map.of(
            String.format("%s:aud", oidc.getOpenIdConnectProviderIssuer()), "sts.amazonaws.com",
            String.format("%s:sub", oidc.getOpenIdConnectProviderIssuer()),
            String.format("system:serviceaccount:%s:%s", sa.metadata().getNamespace(), sa.metadata().getName())))
          .build()));
  }

  public IPrincipal oidcPrincipal(Construct scope, IOpenIdConnectProvider oidc, PodIdentity pod) {
    return new WebIdentityPrincipal(oidc.getOpenIdConnectProviderArn())
      .withConditions(
        Map.of("StringEquals", CfnJson.Builder.create(scope, String.format("oidc-principal-%s", pod.role().name()))
          .value(Map.of(
            String.format("%s:aud", oidc.getOpenIdConnectProviderIssuer()), "sts.amazonaws.com",
            String.format("%s:sub", oidc.getOpenIdConnectProviderIssuer()), String.format("system:serviceaccount:%s:%s", pod.metadata().getNamespace(), pod.metadata().getName())))
          .build()));
  }
}
