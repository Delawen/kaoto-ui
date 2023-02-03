import { useDeploymentStore } from './deploymentStore';
import { useIntegrationSourceStore } from './integrationSourceStore';
import { useNestedStepsStore } from './nestedStepsStore';
import { useSettingsStore } from './settingsStore';
import { useVisualizationStore } from './visualizationStore';
import { extractNestedSteps, insertStep, regenerateUuids } from '@kaoto/services';
import { IIntegration, IStepProps, IViewProps } from '@kaoto/types';
import { setDeepValue } from '@kaoto/utils';
import isEqual from 'lodash.isequal';
import { mountStoreDevtool } from 'simple-zustand-devtools';
import { temporal } from 'zundo';
import { create } from 'zustand';

interface IIntegrationJsonStore {
  appendStep: (newStep: IStepProps) => void;
  deleteBranchStep: (newStep: IStepProps, originalStepIndex: number) => void;
  deleteIntegration: () => void;
  deleteStep: (index: number) => void;
  deleteSteps: () => void;
  insertStep: (newStep: IStepProps, insertIndex: number) => void;
  integrationJson: IIntegration;
  replaceBranchStep: (newStep: IStepProps, pathToOldStep: string[] | undefined) => void;
  replaceStep: (newStep: IStepProps, oldStepIndex?: number) => void;
  setViews: (views: IViewProps[]) => void;
  updateIntegration: (newInt?: any) => void;
  views: IViewProps[];
}

const initialState = {
  branchSteps: {},
  integrationJson: {
    dsl: 'KameletBinding',
    metadata: { name: 'integration', namespace: 'default' },
    steps: [],
    params: [],
  },
  views: [],
};

export const useIntegrationJsonStore = create<IIntegrationJsonStore>()(
  temporal(
    (set, get) => ({
      ...initialState,
      appendStep: (newStep) => {
        set((state) => {
          let newSteps = state.integrationJson.steps.slice();
          // manually generate UUID for the new step
          newStep.UUID = `${newStep.name}-${newSteps.length}`;
          newSteps.push(newStep);
          return {
            integrationJson: {
              ...state.integrationJson,
              steps: newSteps,
            },
          };
        });
      },
      deleteIntegration: () => set(initialState),
      deleteBranchStep: (newStep: IStepProps, originalStepIndex: number) => {
        let newSteps = get().integrationJson.steps.slice();
        // replacing the origin parent of a deeply nested step
        newSteps[originalStepIndex] = newStep;

        const stepsWithNewUuids = regenerateUuids(newSteps);
        const { updateSteps } = useNestedStepsStore.getState();
        updateSteps(extractNestedSteps(stepsWithNewUuids));

        return set((state) => ({
          integrationJson: {
            ...state.integrationJson,
            steps: [...stepsWithNewUuids],
          },
        }));
      },
      deleteStep: (stepIdx) => {
        let stepsCopy = get().integrationJson.steps.slice();
        const updatedSteps = stepsCopy.filter((_step: IStepProps, idx: number) => idx !== stepIdx);
        const stepsWithNewUuids = regenerateUuids(updatedSteps);
        const updateSteps = useNestedStepsStore.getState().updateSteps;
        updateSteps(extractNestedSteps(stepsWithNewUuids));
        set((state) => ({
          integrationJson: {
            ...state.integrationJson,
            steps: stepsWithNewUuids,
          },
        }));
      },
      deleteSteps: () => {
        set((state) => ({
          integrationJson: {
            ...state.integrationJson,
            steps: [],
          },
        }));
      },
      insertStep: (newStep, insertIndex) => {
        let steps = get().integrationJson.steps.slice();
        const stepsWithNewUuids = regenerateUuids(insertStep(steps, insertIndex, newStep));
        const updateSteps = useNestedStepsStore.getState().updateSteps;
        updateSteps(extractNestedSteps(stepsWithNewUuids));

        set((state) => ({
          integrationJson: {
            ...state.integrationJson,
            steps: stepsWithNewUuids,
          },
        }));
      },
      replaceBranchStep: (newStep, pathToOldStep) => {
        let stepsCopy = get().integrationJson.steps.slice();
        stepsCopy = setDeepValue(stepsCopy, pathToOldStep, newStep);

        const stepsWithNewUuids = regenerateUuids(stepsCopy);
        const { updateSteps } = useNestedStepsStore.getState();
        updateSteps(extractNestedSteps(stepsWithNewUuids));

        return set((state) => ({
          integrationJson: {
            ...state.integrationJson,
            steps: [...stepsWithNewUuids],
          },
        }));
      },
      replaceStep: (newStep, oldStepIndex) => {
        let stepsCopy = get().integrationJson.steps.slice();
        if (oldStepIndex === undefined) {
          // replacing a slot step with no pre-existing step
          stepsCopy.unshift(newStep);
        } else {
          // replacing an existing step
          stepsCopy[oldStepIndex] = newStep;
        }

        const stepsWithNewUuids = regenerateUuids(stepsCopy);
        const { updateSteps } = useNestedStepsStore.getState();
        updateSteps(extractNestedSteps(stepsWithNewUuids));

        return set((state) => ({
          integrationJson: {
            ...state.integrationJson,
            steps: [...stepsWithNewUuids],
          },
        }));
      },
      setViews: (viewData: IViewProps[]) => {
        set({ views: viewData });
      },
      updateIntegration: (newInt: IIntegration) => {
        let newIntegration = { ...get().integrationJson, ...newInt };
        const uuidSteps = regenerateUuids(newIntegration.steps);
        const updateSteps = useNestedStepsStore.getState().updateSteps;
        updateSteps(extractNestedSteps(uuidSteps));

        return set({ integrationJson: { ...newIntegration, steps: uuidSteps } });
      },
    }),
    {
      partialize: (state) => {
        const { integrationJson } = state;
        return { integrationJson };
      },
      equality: (a, b) => isEqual(a, b),
    }
  )
);

if (process.env.NODE_ENV === 'development') {
  mountStoreDevtool('integrationJsonStore', useIntegrationJsonStore);
  mountStoreDevtool('integrationSourceStore', useIntegrationSourceStore);
  mountStoreDevtool('nestedStepsStore', useNestedStepsStore);
  mountStoreDevtool('deploymentStore', useDeploymentStore);
  mountStoreDevtool('settingsStore', useSettingsStore);
  mountStoreDevtool('visualizationStore', useVisualizationStore);
}

export const useTemporalIntegrationJsonStore = create(useIntegrationJsonStore.temporal);

export default useIntegrationJsonStore;
