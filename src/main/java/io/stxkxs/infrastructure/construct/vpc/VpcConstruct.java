package io.stxkxs.infrastructure.construct.vpc;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.model.vpc.NetworkConf;
import io.stxkxs.infrastructure.model.vpc.Subnet;
import lombok.Getter;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.ec2.IpAddresses;
import software.amazon.awscdk.services.ec2.SecurityGroup;
import software.amazon.awscdk.services.ec2.SubnetConfiguration;
import software.amazon.awscdk.services.ec2.SubnetType;
import software.amazon.awscdk.services.ec2.Vpc;
import software.constructs.Construct;

import java.util.List;
import java.util.stream.Collectors;

@Getter
public class VpcConstruct extends Construct {
  private final Vpc vpc;
  private final List<SecurityGroup> securityGroups;

  public VpcConstruct(Construct scope, Common common, NetworkConf conf) {
    super(scope, "vpc");

    this.vpc = Vpc.Builder
      .create(this, conf.name())
      .vpcName(conf.name())
      .ipProtocol(conf.ipProtocol())
      .ipAddresses(IpAddresses.cidr(conf.cidr()))
      .availabilityZones(conf.availabilityZones())
      .natGateways(conf.natGateways())
      .createInternetGateway(conf.createInternetGateway())
      .enableDnsSupport(conf.enableDnsSupport())
      .enableDnsHostnames(conf.enableDnsHostnames())
      .defaultInstanceTenancy(conf.defaultInstanceTenancy())
      .subnetConfiguration(conf.subnets().stream()
        .map(subnet -> {
          var subnetConfiguration = SubnetConfiguration.builder()
            .name(subnet.name())
            .cidrMask(subnet.cidrMask())
            .reserved(subnet.reserved())
            .subnetType(subnet.subnetType());

          if (subnet.subnetType().equals(SubnetType.PUBLIC)) {
            subnetConfiguration.mapPublicIpOnLaunch(subnet.mapPublicIpOnLaunch());
          }

          return subnetConfiguration.build();
        }).toList())
      .build();

    this.securityGroups = conf.securityGroups().stream()
      .map(sg -> new SecurityGroupConstruct(scope, common, sg, this.vpc()).securityGroup())
      .toList();

    tagging(common, conf);
  }

  private void tagging(Common common, NetworkConf conf) {
    Maps.from(common.tags(), conf.tags())
      .forEach((key, value) -> Tags.of(this.vpc()).add(key, value));

    var tagsForSubnetType = conf.subnets().stream()
      .collect(Collectors.toMap(Subnet::subnetType, Subnet::tags));

    this.vpc().getPublicSubnets()
      .forEach(subnet -> tagsForSubnetType.get(SubnetType.PUBLIC)
        .forEach((key, value) -> Tags.of(subnet).add(key, value)));

    this.vpc().getPrivateSubnets()
      .forEach(subnet -> tagsForSubnetType.get(SubnetType.PRIVATE_WITH_EGRESS)
        .forEach((key, value) -> Tags.of(subnet).add(key, value)));

    this.vpc().getIsolatedSubnets()
      .forEach(subnet -> tagsForSubnetType.get(SubnetType.PRIVATE_ISOLATED)
        .forEach((key, value) -> Tags.of(subnet).add(key, value)));
  }
}
