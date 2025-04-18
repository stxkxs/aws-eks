package io.stxkxs.infrastructure.model.eks.addon;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.model.eks.addon.core.CertManagerAddon;
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
public class CertManagerConstruct extends Construct {
  private final HelmChart chart;

  @SneakyThrows
  public CertManagerConstruct(Construct scope, Common common, CertManagerAddon conf, ICluster cluster) {
    super(scope, id("certmanager", conf.chart().release()));

    var parsed = Template.parse(scope, conf.chart().values());
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
