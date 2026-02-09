import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Clock, Loader2, Sparkles, Plus, Save, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableTimelinePhase } from "./EditableTimelinePhase";

interface TimelinePhase {
  id: string;
  name: string;
  description: string;
  duration: { value: number; unit: string };
  dependencies?: string[];
  resources?: {
    manpower?: string;
    equipment?: string[];
    materials?: string[];
  };
  costBreakdown?: {
    labour?: number;
    materials?: number;
    equipment?: number;
    total: number;
  };
  riskFactors?: string[];
  status?: string;
}

interface TimelineData {
  enabled?: boolean;
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
  const [durationSaved, setDurationSaved] = useState(false);

  const timeline: TimelineData = config?.timeline || {};
  const phases: TimelinePhase[] = timeline.phases || [];
  const [estDurationValue, setEstDurationValue] = useState<number>(timeline.estimatedDuration?.value || 0);
  const [estDurationUnit, setEstDurationUnit] = useState<string>(timeline.estimatedDuration?.unit || "weeks");

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

  const updateSection = trpc.quotes.updateComprehensiveSection.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to update timeline: " + error.message);
    },
  });

  const handleSavePhase = async (updatedPhase: TimelinePhase) => {
    const updatedPhases = phases.map((p) =>
      p.id === updatedPhase.id ? updatedPhase : p
    );

    await updateSection.mutateAsync({
      quoteId,
      section: "timeline",
      data: {
        ...timeline,
        phases: updatedPhases,
      },
    });

    toast.success("Phase saved");
  };

  const handleDeletePhase = async (phaseId: string) => {
    if (!window.confirm("Delete this phase? This cannot be undone.")) return;

    const updatedPhases = phases.filter((p) => p.id !== phaseId);

    await updateSection.mutateAsync({
      quoteId,
      section: "timeline",
      data: {
        ...timeline,
        phases: updatedPhases,
      },
    });

    toast.success("Phase deleted");
  };

  const handleAddPhase = async () => {
    const newPhase: TimelinePhase = {
      id: `phase-${Date.now()}`,
      name: "New Phase",
      description: "Description of this phase",
      duration: { value: 1, unit: "weeks" },
      dependencies: [],
      resources: { manpower: "", equipment: [], materials: [] },
      costBreakdown: { labour: 0, materials: 0, equipment: 0, total: 0 },
      riskFactors: [],
      status: "pending",
    };

    await updateSection.mutateAsync({
      quoteId,
      section: "timeline",
      data: {
        ...timeline,
        phases: [...phases, newPhase],
      },
    });

    toast.success("New phase added");
  };

  const handleSaveOverallDuration = async () => {
    await updateSection.mutateAsync({
      quoteId,
      section: "timeline",
      data: {
        ...timeline,
        estimatedDuration: { value: estDurationValue, unit: estDurationUnit },
      },
    });

    setDurationSaved(true);
    toast.success("Duration updated");
    setTimeout(() => setDurationSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Project Timeline
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleAddPhase}
                disabled={updateSection.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Phase
              </Button>
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
            </div>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            AI-generated project timeline based on your line items and trade type. Click the pencil icon on any phase to edit it.
          </p>
        </CardHeader>
        <CardContent>
          {phases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No timeline generated yet</p>
              <p className="text-sm">Click "Generate Timeline" to create a project timeline from your line items, or "Add Phase" to create one manually.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Editable Duration Summary */}
              <div className="flex items-end gap-3 p-3 bg-primary/5 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <Label className="font-medium whitespace-nowrap">Estimated Duration:</Label>
                </div>
                <div className="w-20">
                  <Input
                    type="number"
                    min="1"
                    value={estDurationValue || ""}
                    onChange={(e) => setEstDurationValue(parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={estDurationUnit}
                  onChange={(e) => setEstDurationUnit(e.target.value)}
                >
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={handleSaveOverallDuration}
                  disabled={updateSection.isPending}
                >
                  {durationSaved ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {/* Phase Cards */}
              <div className="space-y-4">
                {phases.map((phase, index) => (
                  <EditableTimelinePhase
                    key={phase.id || index}
                    phase={phase}
                    phaseNumber={index + 1}
                    onSave={handleSavePhase}
                    onDelete={handleDeletePhase}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
