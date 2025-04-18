package io.stxkxs.infrastructure.construct.eks;

import com.fasterxml.jackson.core.type.TypeReference;
import io.fabric8.kubernetes.api.model.NamespaceBuilder;
import io.fabric8.kubernetes.api.model.ObjectMeta;
import io.fabric8.kubernetes.client.utils.Serialization;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.serialization.Mapper;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.services.eks.ICluster;
import software.amazon.awscdk.services.eks.KubernetesManifest;
import software.constructs.Construct;

import java.util.List;
import java.util.Map;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class NamespaceConstruct extends Construct {
  private final KubernetesManifest manifest;

  @SneakyThrows
  public NamespaceConstruct(Construct scope, Common common, ObjectMeta metadata, ICluster cluster) {
    super(scope, id("namespace", metadata.getName()));

    var namespace = new NamespaceBuilder()
      .withNewMetadata()
      .withName(metadata.getNamespace())
      .withLabels(metadata.getLabels())
      .withAnnotations(metadata.getAnnotations())
      .endMetadata()
      .build();

    var manifest = Mapper.get()
      .readValue(Serialization.asYaml(namespace), new TypeReference<Map<String, Object>>() {});

    this.manifest = KubernetesManifest.Builder
      .create(this, metadata.getName())
      .cluster(cluster)
      .prune(true)
      .overwrite(true)
      .skipValidation(true)
      .manifest(List.of(manifest))
      .build();
  }
}
