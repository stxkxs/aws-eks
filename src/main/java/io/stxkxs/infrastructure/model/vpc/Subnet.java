package io.stxkxs.infrastructure.model.vpc;

import software.amazon.awscdk.services.ec2.SubnetType;

import java.util.Map;

public record Subnet(
  String name,
  SubnetType subnetType,
  int cidrMask,
  boolean reserved,
  boolean mapPublicIpOnLaunch,
  Map<String, String> tags
) {}
