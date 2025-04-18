package io.stxkxs.infrastructure.construct.eks;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.conf.KubernetesConf;
import io.stxkxs.infrastructure.construct.iam.RoleConstruct;
import io.stxkxs.infrastructure.construct.kms.KmsConstruct;
import io.stxkxs.infrastructure.model.eks.addon.AddonsConf;
import io.stxkxs.infrastructure.model.eks.addon.managed.AwsEbsCsiAddon;
import io.stxkxs.infrastructure.model.eks.addon.managed.ManagedAddon;
import io.stxkxs.infrastructure.model.iam.Principal;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.CfnTag;
import software.amazon.awscdk.services.eks.CfnAddon;
import software.amazon.awscdk.services.eks.Cluster;
import software.amazon.awscdk.services.eks.KubernetesManifest;
import software.amazon.awscdk.services.kms.Key;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class ManagedAddonsConstruct extends Construct {
  private final ManagedAddonConstruct vpcCniConstruct;
  private final ManagedAddonConstruct kubeProxyConstruct;
  private final ManagedAddonConstruct coreDnsConstruct;
  private final ManagedAddonConstruct podIdentityAgentConstruct;
  private final AwsEbsCsiConstruct awsEbsCsiConstruct;
  private final ManagedAddonConstruct containerInsightsConstruct;

  @SneakyThrows
  public ManagedAddonsConstruct(Construct scope, Common common, KubernetesConf conf, Cluster cluster) {
    super(scope, id("managed-addons", conf.name()));

    var addons = Mapper.get().readValue(Template.parse(scope, conf.addons()), AddonsConf.class);
    this.vpcCniConstruct = new ManagedAddonConstruct(this, common, addons.managed().awsVpcCni(), cluster);
    this.kubeProxyConstruct = new ManagedAddonConstruct(this, common, addons.managed().kubeProxy(), cluster);
    this.coreDnsConstruct = new ManagedAddonConstruct(this, common, addons.managed().coreDns(), cluster);
    this.podIdentityAgentConstruct = new ManagedAddonConstruct(this, common, addons.managed().podIdentityAgent(), cluster);
    this.awsEbsCsiConstruct = new AwsEbsCsiConstruct(this, common, addons.managed().awsEbsCsi(), cluster);
    this.containerInsightsConstruct = new ManagedAddonConstruct(this, common, addons.managed().containerInsights(), cluster);
  }

  @Getter
  static class AwsEbsCsiConstruct extends Construct {
    private final ManagedAddonConstruct addonConstruct;
    private final KubernetesManifest storageClass;
    private final Key encryptionKey;

    @SneakyThrows
    public AwsEbsCsiConstruct(Construct scope, Common common, AwsEbsCsiAddon conf, Cluster cluster) {
      super(scope, "aws-ebs-csi");

      this.addonConstruct = new ManagedAddonConstruct(this, common, conf, cluster);
      this.encryptionKey = new KmsConstruct(this, common, conf.kms()).key();

      var parsed = Template.parse(scope, conf.defaultStorageClass());
      var manifest = Mapper.get().readValue(parsed, new TypeReference<Map<String, Object>>() {});
      this.storageClass = KubernetesManifest.Builder
        .create(this, "storageclass")
        .cluster(cluster)
        .overwrite(true)
        .prune(true)
        .skipValidation(true)
        .manifest(List.of(manifest))
        .build();
    }
  }

  @Getter
  static class ManagedAddonConstruct extends Construct {
    private final CfnAddon addon;
    private final String roleArn;

    public ManagedAddonConstruct(Construct scope, Common common, ManagedAddon conf, Cluster cluster) {
      super(scope, id("managed-addon", conf.name()));

      this.roleArn = Optional
        .ofNullable(conf.serviceAccount())
        .map(serviceAccount -> {
          var oidc = cluster.getOpenIdConnectProvider();
          var principal = Principal.builder().build().oidcPrincipal(this, oidc, serviceAccount);
          return new RoleConstruct(this, common, principal, serviceAccount.role())
            .role()
            .getRoleArn();
        })
        .orElse(null);

      this.addon = CfnAddon.Builder
        .create(this, conf.name())
        .clusterName(cluster.getClusterName())
        .addonName(conf.name())
        .addonVersion(conf.version())
        .configurationValues(conf.configurationValues())
        .preserveOnDelete(conf.preserveOnDelete())
        .resolveConflicts(conf.resolveConflicts().toUpperCase())
        .serviceAccountRoleArn(this.roleArn())
        .tags(Maps.from(common.tags(), conf.tags())
          .entrySet().stream()
          .map(entry -> CfnTag.builder()
            .key(entry.getKey())
            .value(entry.getValue())
            .build()).toList())
        .build();
    }
  }
}
