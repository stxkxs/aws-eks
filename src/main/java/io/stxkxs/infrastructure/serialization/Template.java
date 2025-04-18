package io.stxkxs.infrastructure.serialization;

import com.github.mustachejava.DefaultMustacheFactory;
import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.conf.Environment;
import io.stxkxs.infrastructure.conf.Version;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.constructs.Construct;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Slf4j
public class Template {

  @SneakyThrows
  public static String parse(Construct scope, String file) {
    var version = Version.of(scope.getNode().getContext("host:version"));
    var environment = Environment.of(scope.getNode().getContext("host:environment"));
    return execute(environment, version, file, defaults(scope));
  }

  @SneakyThrows
  public static String parse(Construct scope, String file, Map<String, Object> values) {
    var version = Version.of(scope.getNode().getContext("host:version"));
    var environment = Environment.of(scope.getNode().getContext("host:environment"));
    return execute(environment, version, file, Common.Maps.from(defaults(scope), values));
  }

  @SneakyThrows
  private static String execute(Environment environment, Version version, String file, Map<String, Object> values) {
    log.debug("parsing template {}/{}/{} with parameters {}", environment, version, file, values);

    var factory = new DefaultMustacheFactory();
    var writer = new StringWriter();
    var prefix = String.format("%s/%s", environment, version);
    var template = String.format("%s/%s", prefix, file);

    try (var stream = Template.class.getClassLoader().getResourceAsStream(template)) {
      if (stream == null) {
        var m = String.format("error parsing template! can not find %s.", template);
        throw new RuntimeException(m);
      }

      assemble(stream, template, values, factory, writer);
    }

    return writer.toString();
  }

  protected static Map<String, Object> defaults(Construct scope) {
    return Map.ofEntries(
      Map.entry("host:id", scope.getNode().getContext("host:id").toString()),
      Map.entry("host:organization", scope.getNode().getContext("host:organization").toString()),
      Map.entry("host:account", scope.getNode().getContext("host:account").toString()),
      Map.entry("host:region", scope.getNode().getContext("host:region").toString()),
      Map.entry("host:name", scope.getNode().getContext("host:name").toString()),
      Map.entry("host:alias", scope.getNode().getContext("host:alias").toString()),
      Map.entry("host:environment", scope.getNode().getContext("host:environment").toString()),
      Map.entry("host:version", scope.getNode().getContext("host:version").toString()),
      Map.entry("host:domain", scope.getNode().getContext("host:domain").toString()),
      Map.entry("hosted:id", scope.getNode().getContext("hosted:id").toString()),
      Map.entry("hosted:organization", scope.getNode().getContext("hosted:organization").toString()),
      Map.entry("hosted:account", scope.getNode().getContext("hosted:account").toString()),
      Map.entry("hosted:region", scope.getNode().getContext("hosted:region").toString()),
      Map.entry("hosted:name", scope.getNode().getContext("hosted:name").toString()),
      Map.entry("hosted:alias", scope.getNode().getContext("hosted:alias").toString()),
      Map.entry("hosted:environment", scope.getNode().getContext("hosted:environment").toString()),
      Map.entry("hosted:version", scope.getNode().getContext("hosted:version").toString()),
      Map.entry("hosted:domain", scope.getNode().getContext("hosted:domain").toString())
    );
  }

  @SneakyThrows
  protected static void assemble(InputStream stream, String template, Map<String, Object> values, DefaultMustacheFactory factory, StringWriter writer) {
    factory.compile(new InputStreamReader(stream, StandardCharsets.UTF_8), template)
      .execute(writer, values)
      .flush();
  }
}
