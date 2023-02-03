import './Visualization.css';
import { fetchViews } from '@kaoto/api';
import {
  KaotoDrawer,
  PlusButtonEdge,
  StepErrorBoundary,
  VisualizationControls,
  VisualizationStep,
  VisualizationStepViews,
} from '@kaoto/components';
import {
  buildBranchSpecialEdges,
  buildEdges,
  buildNodesFromSteps,
  findStepIdxWithUUID,
  flattenSteps,
  getLayoutedElements,
  filterStepWithBranches,
} from '@kaoto/services';
import { useIntegrationJsonStore, useNestedStepsStore, useVisualizationStore } from '@kaoto/store';
import { IStepProps, IViewData, IVizStepPropsEdge, IVizStepNode } from '@kaoto/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Viewport } from 'reactflow';

interface IVisualization {
  initialState?: IViewData;
  toggleCatalog?: () => void;
}

const Visualization = ({ toggleCatalog }: IVisualization) => {
  // `nodes` is an array of UI-specific objects that represent
  // the Integration.Steps model visually, while `edges` connect them

  const defaultViewport: Viewport = {
    // 80/2 means half of the size of the icon so the placeholder icon can be centered
    x: window.innerWidth / 2 - 80 / 2,
    y: (window.innerHeight - 77) / 2 - 80 / 2,
    zoom: 1.2,
  };
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);
  const [selectedStep, setSelectedStep] = useState<IStepProps>({
    maxBranches: 0,
    minBranches: 0,
    name: '',
    type: '',
    UUID: '',
  });
  const {
    deleteBranchStep,
    deleteStep,
    integrationJson,
    replaceBranchStep,
    replaceStep,
    setViews,
  } = useIntegrationJsonStore();
  const { nestedSteps } = useNestedStepsStore();
  const layout = useVisualizationStore((state) => state.layout);
  const previousIntegrationJson = useRef(integrationJson);
  const previousLayout = useRef(layout);
  const { nodes, setNodes, onNodesChange, edges, setEdges, onEdgesChange, deleteNode } =
    useVisualizationStore();

  // initial loading of visualization steps
  useEffect(() => {
    const { stepNodes, stepEdges } = buildNodesAndEdges(integrationJson.steps);

    getLayoutedElements(stepNodes, stepEdges, layout)
      .then((res) => {
        const { layoutedNodes, layoutedEdges } = res;
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      })
      .catch((e) => console.error(e));
  }, []);

  /**
   * Check for changes to integrationJson,
   * which causes Visualization nodes to all be redrawn
   */
  useEffect(() => {
    if (previousIntegrationJson.current === integrationJson) return;

    fetchViews(integrationJson.steps).then((views) => {
      setViews(views);
    });

    const { stepNodes, stepEdges } = buildNodesAndEdges(integrationJson.steps);
    getLayoutedElements(stepNodes, stepEdges, layout)
      .then((res) => {
        const { layoutedNodes, layoutedEdges } = res;
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      })
      .catch((e) => console.error(e));

    previousIntegrationJson.current = integrationJson;
  }, [integrationJson]);

  useEffect(() => {
    if (previousLayout.current === layout) return;

    getLayoutedElements(nodes, edges, layout)
      .then((res) => {
        const { layoutedNodes, layoutedEdges } = res;
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      })
      .catch((e) => console.error(e));

    previousLayout.current = layout;
  }, [layout]);

  const nodeTypes = useMemo(() => ({ step: VisualizationStep }), []);
  const edgeTypes = useMemo(
    () => ({
      insert: PlusButtonEdge,
    }),
    []
  );

  function buildNodesAndEdges(steps: IStepProps[]) {
    // build all nodes
    const stepNodes = buildNodesFromSteps(steps, layout, {
      handleDeleteStep,
    });

    // build edges only for main nodes
    const filteredNodes = stepNodes.filter((node) => !node.data.branchInfo?.branchStep);
    let stepEdges: IVizStepPropsEdge[] = buildEdges(filteredNodes);

    // build edges for branch nodes
    const branchSpecialEdges: IVizStepPropsEdge[] = buildBranchSpecialEdges(stepNodes);

    stepEdges = stepEdges.concat(...branchSpecialEdges);

    return { stepNodes, stepEdges };
  }

  const handleDeleteStep = (UUID?: string) => {
    if (!UUID) return;

    setSelectedStep({ maxBranches: 0, minBranches: 0, name: '', type: '', UUID: '' });
    if (isPanelExpanded) setIsPanelExpanded(false);

    // check if the step being modified is nested
    const currentStepNested = nestedSteps.find((ns) => ns.stepUuid === UUID);
    if (currentStepNested) {
      const parentStepIdx = findStepIdxWithUUID(
        currentStepNested.originStepUuid,
        integrationJson.steps
      );

      // update the original parent step, without the child step
      const updatedParentStep = filterStepWithBranches(
        integrationJson.steps[parentStepIdx],
        (step: { UUID: string }) => step.UUID !== UUID
      );

      deleteBranchStep(updatedParentStep, parentStepIdx);
    } else {
      // `deleteStep` requires the index to be from `integrationJson`, not `nodes`
      const stepsIndex = findStepIdxWithUUID(UUID, integrationJson.steps);

      deleteNode(stepsIndex);
      deleteStep(stepsIndex);
    }
  };

  const onClosePanelClick = () => {
    setIsPanelExpanded(false);
  };

  /**
   * Called when a catalog step is dragged over the visualization canvas
   * @param event
   */
  const onDragOver = (event: {
    preventDefault: () => void;
    dataTransfer: { dropEffect: string };
  }) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  /**
   * Called when a React Flow node is clicked
   * @param _e
   * @param node
   */
  const onNodeClick = (_e: any, node: IVizStepNode) => {
    // here we check if it's a node or edge
    // workaround for https://github.com/wbkd/react-flow/issues/2202
    if (!_e.target.classList.contains('stepNode__clickable')) return;

    if (node.data.isPlaceholder) {
      // prevent slots from being selected, passive-aggressively open the steps catalog
      if (toggleCatalog) toggleCatalog();
      return;
    }

    const flatSteps = flattenSteps(integrationJson.steps);
    const stepIdx = flatSteps.map((s: IStepProps) => s.UUID).indexOf(node.data.step.UUID);

    if (stepIdx !== -1) setSelectedStep(flatSteps[stepIdx]);

    if (!isPanelExpanded) setIsPanelExpanded(true);
  };

  const onLoad = (_reactFlowInstance: any) => {
    setReactFlowInstance(_reactFlowInstance);
  };

  /**
   * Handles Step View configuration changes
   * @param newValues
   */
  const saveConfig = (newValues: { [s: string]: unknown } | ArrayLike<unknown>) => {
    let newStep: IStepProps = selectedStep;
    const newStepParameters = newStep.parameters?.slice();

    if (newStepParameters && newStepParameters.length > 0) {
      Object.entries(newValues).map(([key, value]) => {
        const paramIndex = newStepParameters.findIndex((p) => p.id === key);
        newStepParameters[paramIndex!].value = value;
      });

      // check if the step being modified is nested
      if (nestedSteps.some((ns) => ns.stepUuid === newStep.UUID)) {
        // use its path to replace only this part of the original step
        const currentStepNested = nestedSteps.find((ns) => ns.stepUuid === newStep.UUID);
        if (currentStepNested) {
          replaceBranchStep(newStep, currentStepNested.pathToStep);
        }
      } else {
        const oldStepIdx = findStepIdxWithUUID(newStep.UUID, integrationJson.steps);
        replaceStep(newStep, oldStepIdx);
      }
    } else {
      return;
    }
  };

  return (
    <StepErrorBoundary>
      {/* RIGHT DRAWER: STEP DETAIL & EXTENSIONS */}
      <KaotoDrawer
        isExpanded={isPanelExpanded}
        isResizable={true}
        panelContent={
          <VisualizationStepViews
            step={selectedStep}
            isPanelExpanded={isPanelExpanded}
            onClosePanelClick={onClosePanelClick}
            saveConfig={saveConfig}
          />
        }
        position={'right'}
        id={'right-resize-panel'}
        defaultSize={'500px'}
        minSize={'150px'}
      >
        <div
          className="reactflow-wrapper"
          data-testid={'react-flow-wrapper'}
          ref={reactFlowWrapper}
          style={{
            width: '100vw',
            height: 'calc(100vh - 77px )',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            defaultViewport={defaultViewport}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onLoad={onLoad}
            snapToGrid={true}
            snapGrid={[15, 15]}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
          >
            {/*<MiniMap nodeBorderRadius={2} className={'visualization__minimap'} />*/}
            <VisualizationControls />
            <Background color="#aaa" gap={16} />
          </ReactFlow>
        </div>
      </KaotoDrawer>
    </StepErrorBoundary>
  );
};

export { Visualization };
