package io.stxkxs.infrastructure;

import com.fasterxml.jackson.core.type.TypeReference;
import io.stxkxs.infrastructure.conf.Hosted;
import io.stxkxs.infrastructure.conf.Platform;
import io.stxkxs.infrastructure.serialization.Mapper;
import io.stxkxs.infrastructure.serialization.Template;
import io.stxkxs.infrastructure.stack.EksPlatform;
import lombok.SneakyThrows;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.StackProps;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static io.stxkxs.infrastructure.conf.Common.Maps;
import static io.stxkxs.infrastructure.serialization.Format.describe;
import static io.stxkxs.infrastructure.serialization.Format.name;

public class Launch {
  public static void main(final String[] args) {
    var app = new App();

    var conf = get(app);

    new EksPlatform(
      app, conf.hosted(),
      StackProps.builder()
        .stackName(name(conf.hosted().common().id(), "eks"))
        .env(Environment.builder()
          .account(conf.hosted().common().account())
          .region(conf.hosted().common().region())
          .build())
        .description(describe(conf.host().common(),
          String.format("%s %s release",
            conf.hosted().common().name(), conf.hosted().common().alias())))
        .tags(Maps.from(conf.host().common().tags(), conf.hosted().common().tags()))
        .build());

    app.synth();
  }

  @SneakyThrows
  private static Hosted<Platform> get(App app) {
    var parsed = Template.parse(app, "conf.mustache",
      Map.ofEntries(Map.entry("hosted:tags", tags(app))));
    var type = new TypeReference<Hosted<Platform>>() {};
    return Mapper.get().readValue(parsed, type);
  }

  private static ArrayList<Map<String, String>> tags(App app) {
    var tags = app.getNode().getContext("hosted:tags");
    var results = new ArrayList<Map<String, String>>();
    if (tags instanceof List<?> tagList) {
      for (var tag : tagList) {
        if (tag instanceof Map<?, ?> tagMap) {
          var safeTagMap = new HashMap<String, String>();
          for (var entry : tagMap.entrySet()) {
            if (entry.getKey() instanceof String key && entry.getValue() instanceof String value) {
              safeTagMap.put(key, value);
            }
          }
          results.add(safeTagMap);
        }
      }
    }

    return results;
  }
}
