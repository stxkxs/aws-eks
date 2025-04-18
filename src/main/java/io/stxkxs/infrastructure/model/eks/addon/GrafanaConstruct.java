package io.stxkxs.infrastructure.model.eks.addon;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.model.eks.addon.core.GrafanaAddon;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import lombok.Getter;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.eks.HelmChart;
import software.amazon.awscdk.services.eks.ICluster;
import software.constructs.Construct;

import java.util.Map;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Slf4j
@Getter
public class GrafanaConstruct extends Construct {
  private final HelmChart chart;

  @SneakyThrows
  public GrafanaConstruct(Construct scope, Common common, GrafanaAddon conf, ICluster cluster) {
    super(scope, id("grafana", conf.chart().release()));

    var parsed = Template.parse(scope, conf.chart().values(),
      Map.ofEntries(
        Map.entry("hosted:eks:grafana:instanceId", scope.getNode().tryGetContext("hosted:eks:grafana:instanceId")),
        Map.entry("hosted:eks:grafana:key", scope.getNode().tryGetContext("hosted:eks:grafana:key")),
        Map.entry("hosted:eks:grafana:lokiHost", scope.getNode().tryGetContext("hosted:eks:grafana:lokiHost")),
        Map.entry("hosted:eks:grafana:lokiUsername", scope.getNode().tryGetContext("hosted:eks:grafana:lokiUsername")),
        Map.entry("hosted:eks:grafana:prometheusHost", scope.getNode().tryGetContext("hosted:eks:grafana:prometheusHost")),
        Map.entry("hosted:eks:grafana:prometheusUsername", scope.getNode().tryGetContext("hosted:eks:grafana:prometheusUsername")),
        Map.entry("hosted:eks:grafana:tempoHost", scope.getNode().tryGetContext("hosted:eks:grafana:tempoHost")),
        Map.entry("hosted:eks:grafana:tempoUsername", scope.getNode().tryGetContext("hosted:eks:grafana:tempoUsername")),
        Map.entry("hosted:eks:grafana:fleetManagementHost", scope.getNode().tryGetContext("hosted:eks:grafana:fleetManagementHost")),
        Map.entry("hosted:eks:grafana:pyroscopeHost", scope.getNode().tryGetContext("hosted:eks:grafana:pyroscopeHost"))));

    var values = Mapper.get().readValue(parsed, new TypeReference<Map<String, Object>>() {});
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
  }
}
