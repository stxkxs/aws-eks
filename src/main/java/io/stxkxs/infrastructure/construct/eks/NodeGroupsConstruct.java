package io.stxkxs.infrastructure.construct.eks;

import io.stxkxs.infrastructure.construct.iam.RoleConstruct;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.model.eks.NodeGroup;
import lombok.Getter;
import software.amazon.awscdk.services.ec2.InstanceType;
import software.amazon.awscdk.services.eks.CapacityType;
import software.amazon.awscdk.services.eks.ICluster;
import software.amazon.awscdk.services.eks.Nodegroup;
import software.constructs.Construct;

import java.util.List;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class NodeGroupsConstruct extends Construct {
  private final List<Nodegroup> nodeGroups;

  public NodeGroupsConstruct(Construct scope, String id, Common common, List<NodeGroup> conf, ICluster cluster) {
    super(scope, id("nodegroups", id));

    this.nodeGroups = conf.stream()
      .map(nodeGroup -> {
        var principal = nodeGroup.role().principal().iamPrincipal();
        var role = new RoleConstruct(this, common, principal, nodeGroup.role()).role();

        return Nodegroup.Builder
          .create(this, nodeGroup.name())
          .cluster(cluster)
          .nodegroupName(nodeGroup.name())
          .amiType(nodeGroup.amiType())
          .instanceTypes(List.of(InstanceType.of(nodeGroup.instanceClass(), nodeGroup.instanceSize())))
          .minSize(nodeGroup.minSize())
          .maxSize(nodeGroup.maxSize())
          .desiredSize(nodeGroup.desiredSize())
          .capacityType(CapacityType.valueOf(nodeGroup.capacityType().toUpperCase()))
          .nodeRole(role)
          .forceUpdate(nodeGroup.forceUpdate())
          .labels(nodeGroup.labels())
          .tags(Maps.from(common.tags(), nodeGroup.tags()))
          .build();
      }).toList();
  }
}
