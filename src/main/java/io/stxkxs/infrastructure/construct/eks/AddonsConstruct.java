package io.stxkxs.infrastructure.construct.eks;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.KubernetesConf;
import io.stxkxs.infrastructure.model.eks.addon.AddonsConf;
import io.stxkxs.infrastructure.model.eks.addon.AwsLoadBalancerConstruct;
import io.stxkxs.infrastructure.model.eks.addon.AwsSecretsStoreConstruct;
import io.stxkxs.infrastructure.model.eks.addon.CertManagerConstruct;
import io.stxkxs.infrastructure.model.eks.addon.CsiSecretsStoreConstruct;
import io.stxkxs.infrastructure.model.eks.addon.GrafanaConstruct;
import io.stxkxs.infrastructure.model.eks.addon.KarpenterConstruct;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.services.eks.Cluster;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Slf4j
@Getter
public class AddonsConstruct extends Construct {
  private final GrafanaConstruct grafana;
  private final CertManagerConstruct certManager;
  private final CsiSecretsStoreConstruct csiSecretsStore;
  private final AwsSecretsStoreConstruct awsSecretsStore;
  private final KarpenterConstruct karpenter;
  private final AwsLoadBalancerConstruct awsLoadBalancer;

  @SneakyThrows
  public AddonsConstruct(Construct scope, Common common, KubernetesConf conf, Cluster cluster) {
    super(scope, id("eks.addons", conf.name()));

    var addons = Mapper.get().readValue(Template.parse(scope, conf.addons()), AddonsConf.class);

    this.grafana = new GrafanaConstruct(this, common, addons.grafana(), cluster);

    this.certManager = new CertManagerConstruct(this, common, addons.certManager(), cluster);
    this.certManager().getNode().addDependency(this.grafana());

    this.csiSecretsStore = new CsiSecretsStoreConstruct(this, common, addons.csiSecretsStore(), cluster);
    this.csiSecretsStore().getNode().addDependency(this.grafana(), this.certManager());

    this.awsSecretsStore = new AwsSecretsStoreConstruct(this, common, addons.awsSecretsStore(), cluster);
    this.awsSecretsStore().getNode().addDependency(this.grafana(), this.certManager(), this.csiSecretsStore());

    this.karpenter = new KarpenterConstruct(this, common, addons.karpenter(), cluster);
    this.karpenter().getNode().addDependency(this.grafana(), this.certManager(), this.csiSecretsStore(), this.awsSecretsStore());

    this.awsLoadBalancer = new AwsLoadBalancerConstruct(this, common, addons.awsLoadBalancer(), cluster);
    this.awsLoadBalancer().getNode().addDependency(this.grafana(), this.certManager(), this.csiSecretsStore(), this.awsSecretsStore(), this.karpenter());
  }
}
