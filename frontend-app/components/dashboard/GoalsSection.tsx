"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit3, Target, Plus } from "lucide-react";
import { 
  PersonalizationData,
  INVESTMENT_GOAL_DESCRIPTIONS
} from "@/lib/types/personalization";
import { 
  getPersonalizationData
} from "@/utils/api/personalization-client";

interface GoalsSectionProps {
  userId: string;
  firstName?: string;
}

export default function GoalsSection({ userId, firstName }: GoalsSectionProps) {
  const [personalizationData, setPersonalizationData] = useState<PersonalizationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch personalization data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await getPersonalizationData();
        setPersonalizationData(data);
        
      } catch (err) {
        console.error('Error fetching personalization data:', err);
        setError('Failed to load goals');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const goToUpdateAll = () => {
    window.location.href = '/account/update-personalization';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Target className="h-5 w-5" />
            Investment Goals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">Loading goals...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!personalizationData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Target className="h-5 w-5" />
            Investment Goals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              Complete your personalization to set investment goals
            </p>
            <Button variant="outline" onClick={() => window.location.href = '/account/update-personalization'}>
              Complete Personalization
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentGoals = personalizationData.investmentGoals || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {'Investment Goals'}
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={goToUpdateAll}>
            <Edit3 className="h-4 w-4 mr-2" />
            Update All
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {currentGoals.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {currentGoals.map((goal) => (
                <Badge key={goal} variant="secondary" className="text-xs">
                  {INVESTMENT_GOAL_DESCRIPTIONS[goal]}
                </Badge>
              ))}
            </div>
            <div className="text-sm text-muted-foreground">
              I'll use these goals to personalize my investment advice and recommendations for you.
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm mb-3">
              No investment goals set yet
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={goToUpdateAll}
            >
              Add Goals
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
