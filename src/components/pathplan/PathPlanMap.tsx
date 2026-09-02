import React from "react";
import { View, Text } from "react-native";
import { PathPlanMapNative } from "./PathPlanMapNative";
import { ErrorBoundary } from "../shared/ErrorBoundary";

export const PathPlanMap = (props: any) => (
  <ErrorBoundary
    componentName="Path Plan Map"
    fallback={
      <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", padding: 16 }}>
          Map failed to load. Drawing tools and mission controls remain active.
        </Text>
      </View>
    }
  >
    <PathPlanMapNative {...props} />
  </ErrorBoundary>
);
