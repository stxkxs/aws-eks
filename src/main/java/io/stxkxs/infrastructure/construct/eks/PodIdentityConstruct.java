package io.stxkxs.infrastructure.construct.eks;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.model.eks.PodIdentity;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.services.eks.CfnPodIdentityAssociation;
import software.amazon.awscdk.services.eks.ICluster;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class PodIdentityConstruct extends Construct {
  private final ServiceAccountConstruct serviceAccountConstruct;
  private final CfnPodIdentityAssociation association;

  @SneakyThrows
  public PodIdentityConstruct(Construct scope, Common common, PodIdentity conf, ICluster cluster) {
    super(scope, id("pod-identity-association", conf.metadata().getName()));

    this.serviceAccountConstruct = new ServiceAccountConstruct(this, common, conf, cluster);
    this.association = CfnPodIdentityAssociation.Builder
      .create(this, conf.metadata().getName())
      .clusterName(cluster.getClusterName())
      .serviceAccount(conf.metadata().getName())
      .namespace(conf.metadata().getNamespace())
      .roleArn(this.serviceAccountConstruct().roleConstruct().role().getRoleArn())
      .build();
  }
}
