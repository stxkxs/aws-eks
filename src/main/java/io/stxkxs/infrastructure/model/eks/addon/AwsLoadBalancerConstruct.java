package io.stxkxs.infrastructure.model.eks.addon;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.construct.eks.NamespaceConstruct;
import io.stxkxs.infrastructure.construct.eks.ServiceAccountConstruct;
import io.stxkxs.infrastructure.model.eks.addon.core.AwsLoadBalancerAddon;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.eks.HelmChart;
import software.amazon.awscdk.services.eks.ICluster;
import software.constructs.Construct;

import java.util.Map;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class AwsLoadBalancerConstruct extends Construct {
  private final NamespaceConstruct namespace;
  private final ServiceAccountConstruct serviceAccount;
  private final HelmChart chart;

  @SneakyThrows
  public AwsLoadBalancerConstruct(Construct scope, Common common, AwsLoadBalancerAddon conf, ICluster cluster) {
    super(scope, id("awsloadbalancer", conf.chart().release()));

    this.namespace = new NamespaceConstruct(this, common, conf.serviceAccount().metadata(), cluster);

    this.serviceAccount = new ServiceAccountConstruct(this, common, conf.serviceAccount(), cluster);
    this.serviceAccount().getNode().addDependency(this.namespace());

    var values = Mapper.get().readValue(Template.parse(scope, conf.chart().values()), new TypeReference<Map<String, Object>>() {});
    this.chart = HelmChart.Builder
      .create(this, conf.chart().name())
      .cluster(cluster)
      .wait(true)
      .timeout(Duration.minutes(15))
      .skipCrds(false)
      .createNamespace(true)
      .chart(conf.chart().name())
      .namespace(conf.chart().namespace())
      .repository(conf.chart().repository())
      .release(conf.chart().release())
      .version(conf.chart().version())
      .values(values)
      .build();

    this.chart().getNode().addDependency(this.serviceAccount());
  }
}
