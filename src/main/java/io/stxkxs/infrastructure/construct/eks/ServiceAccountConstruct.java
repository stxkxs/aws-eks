package io.stxkxs.infrastructure.construct.eks;

import io.stxkxs.infrastructure.construct.iam.RoleConstruct;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;

import io.stxkxs.infrastructure.model.eks.PodIdentity;
import io.stxkxs.infrastructure.model.eks.ServiceAccountConf;
import io.stxkxs.infrastructure.model.iam.Principal;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.services.eks.ICluster;
import software.amazon.awscdk.services.eks.ServiceAccount;
import software.amazon.awscdk.services.iam.SessionTagsPrincipal;
import software.constructs.Construct;

import java.util.Map;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class ServiceAccountConstruct extends Construct {
  private final String AWS_ROLE_ARN = "eks.amazonaws.com/role-arn";

  private final RoleConstruct roleConstruct;
  private final ServiceAccount serviceAccount;

  @SneakyThrows
  public ServiceAccountConstruct(Construct scope, Common common, ServiceAccountConf conf, ICluster cluster) {
    super(scope, id("service-account", conf.metadata().getName()));

    var oidc = cluster.getOpenIdConnectProvider();
    var principal = Principal.builder().build().oidcPrincipal(scope, oidc, conf);
    this.roleConstruct = new RoleConstruct(this, common, principal, conf.role());
    this.serviceAccount = ServiceAccount.Builder
      .create(this, conf.metadata().getName())
      .cluster(cluster)
      .name(conf.metadata().getName())
      .namespace(conf.metadata().getNamespace())
      .labels(conf.metadata().getLabels())
      .annotations(Maps.from(
        conf.metadata().getAnnotations(),
        Map.of(AWS_ROLE_ARN, this.roleConstruct().role().getRoleArn())))
      .build();
  }

  @SneakyThrows
  public ServiceAccountConstruct(Construct scope, Common common, PodIdentity conf, ICluster cluster) {
    super(scope, id("service-account", conf.metadata().getName()));

    var principal = new SessionTagsPrincipal(conf.role().principal().iamPrincipal());
    this.roleConstruct = new RoleConstruct(this, common, principal, conf.role());
    this.serviceAccount = ServiceAccount.Builder
      .create(this, conf.metadata().getName())
      .cluster(cluster)
      .name(conf.metadata().getName())
      .namespace(conf.metadata().getNamespace())
      .labels(conf.metadata().getLabels())
      .annotations(Maps.from(
        conf.metadata().getAnnotations(),
        Map.of(AWS_ROLE_ARN, this.roleConstruct().role().getRoleArn())))
      .build();
  }
}
