package io.stxkxs.infrastructure.construct.secretsmanager;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Common.Maps;
import io.stxkxs.infrastructure.model.secretsmanager.SecretCredentials;
import lombok.Getter;
import lombok.SneakyThrows;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awscdk.services.secretsmanager.SecretStringGenerator;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class SecretConstruct extends Construct {
  private static final String ignore = "/!@#^~*()_+={};:,.<>]*$\"\\`\\'\\-\\|\\?\\[\\]";

  private final Secret secret;

  @SneakyThrows
  public SecretConstruct(Construct scope, Common common, SecretCredentials conf) {
    super(scope, id("secret", conf.name()));

    this.secret = Secret.Builder
      .create(this, conf.name())
      .secretName(conf.name())
      .description(conf.description())
      .generateSecretString(SecretStringGenerator.builder()
        .passwordLength(conf.password().length())
        .excludeNumbers(conf.password().excludeNumbers())
        .excludeLowercase(conf.password().excludeLowercase())
        .excludeUppercase(conf.password().excludeUppercase())
        .includeSpace(conf.password().includeSpace())
        .requireEachIncludedType(conf.password().includeSpace())
        .secretStringTemplate(String.format("{\"username\": \"%s\"}", conf.username()))
        .generateStringKey("password")
        .excludeCharacters(ignore)
        .build())
      .removalPolicy(RemovalPolicy.valueOf(conf.removalPolicy().toUpperCase()))
      .build();

    Maps.from(common.tags(), conf.tags())
      .forEach((key, value) -> Tags.of(secret).add(key, value));
  }
}
