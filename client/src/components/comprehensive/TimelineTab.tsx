import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Clock, Loader2, Sparkles, AlertTriangle, Users, Wrench, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface TimelinePhase {
  id: string;
  name: string;
  description: string;
  duration: { value: number; unit: string };
  resources?: { manpower?: string; equipment?: string[]; materials?: string[] };
  costBreakdown?: { labour?: number; materials?: number; equipment?: number; total?: number };
  riskFactors?: string[];
}

interface TimelineData {
  estimatedDuration?: { value: number; unit: string };
  phases?: TimelinePhase[];
}

interface TimelineTabProps {
  quoteId: number;
  config: any;
  refetch: () => void;
}

export default function TimelineTab({ quoteId, config, refetch }: TimelineTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const suggestTimeline = trpc.quotes.suggestTimeline.useMutation({
    onMutate: () => setIsGenerating(true),
    onSuccess: () => {
      toast.success("Timeline generated successfully");
      setIsGenerating(false);
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to generate timeline: " + error.message);
      setIsGenerating(false);
    },
  });

  const timeline: TimelineData = config?.timeline || {};
  const phases = timeline.phases || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Project Timeline
            </div>
            <Button
              onClick={() => suggestTimeline.mutate({ quoteId })}
              disabled={isGenerating}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {phases.length > 0 ? "Regenerate Timeline" : "Generate Timeline"}
            </Button>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            AI-generated project timeline based on your line items and trade type. Review and adjust as needed.
          </p>
        </CardHeader>
        <CardContent>
          {phases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No timeline generated yet</p>
              <p className="text-sm">Click "Generate Timeline" to create a project timeline from your line items.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Duration Summary */}
              {timeline.estimatedDuration && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="font-medium">Estimated Duration:</span>
                  <span>{timeline.estimatedDuration.value} {timeline.estimatedDuration.unit}</span>
                </div>
              )}

              {/* Phase Cards */}
              <div className="space-y-4">
                {phases.map((phase, index) => (
                  <Card key={phase.id || index} className="border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">
                            Phase {index + 1}: {phase.name}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                        </div>
                        <Badge variant="outline">
                          {phase.duration?.value} {phase.duration?.unit}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        {/* Resources */}
                        {phase.resources && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" /> Resources
                            </h5>
                            {phase.resources.manpower && (
                              <p className="text-sm text-muted-foreground">{phase.resources.manpower}</p>
                            )}
                            {phase.resources.equipment && phase.resources.equipment.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {phase.resources.equipment.map((eq, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    <Wrench className="h-3 w-3 mr-1" />{eq}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {phase.resources.materials && phase.resources.materials.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {phase.resources.materials.map((mat, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    <Package className="h-3 w-3 mr-1" />{mat}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Cost Breakdown */}
                        {phase.costBreakdown && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium">Cost Breakdown</h5>
                            <div className="text-sm space-y-1">
                              {phase.costBreakdown.labour != null && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Labour</span>
                                  <span>£{phase.costBreakdown.labour.toLocaleString()}</span>
                                </div>
                              )}
                              {phase.costBreakdown.materials != null && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Materials</span>
                                  <span>£{phase.costBreakdown.materials.toLocaleString()}</span>
                                </div>
                              )}
                              {phase.costBreakdown.equipment != null && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Equipment</span>
                                  <span>£{phase.costBreakdown.equipment.toLocaleString()}</span>
                                </div>
                              )}
                              {phase.costBreakdown.total != null && (
                                <div className="flex justify-between font-medium border-t pt-1">
                                  <span>Phase Total</span>
                                  <span>£{phase.costBreakdown.total.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Risk Factors */}
                        {phase.riskFactors && phase.riskFactors.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" /> Risk Factors
                            </h5>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {phase.riskFactors.map((risk, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  <span className="text-amber-500 mt-0.5">•</span> {risk}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
