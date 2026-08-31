import { useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import IntegrationTools from '../IntegrationTools/IntegrationTools.jsx'
import ProviderBadge from '../ProviderBadge/ProviderBadge.jsx'
import SubagentNode from '../SubagentNode/SubagentNode.jsx'
import { buildGraph, layoutPositions, mergeNodeData } from '../flow-graph.js'
import './SubagentFlow.css'

const PARENT_NODE = 'parent'
const SUBAGENT_NODE = 'subagent'
const FIT_VIEW_OPTIONS = { padding: 0.15 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--border-strong)' }
const SHARED_EDGE_STYLE = { stroke: 'var(--border-strong)', strokeWidth: 1.5, strokeDasharray: '6 6' }
const EXCLUSIVE_EDGE_STYLE = { stroke: 'var(--border-strong)', strokeWidth: 1.5 }

function describeParentTools(remaining, delegated) {
  if (delegated === 0) return `${remaining} tools`

  return `${remaining} tools (${delegated} delegated)`
}

function ParentFlowNode({ data }) {
  return (
    <div className="subagent-flow__parent card">
      <span className="subagent-flow__name">Soporti</span>
      <ProviderBadge provider={data.globalProvider} model={data.globalModel} />
      <div className="subagent-flow__logos">
        {data.groups.map(entry => (
          <IntegrationTools group={entry.group} toolNames={entry.tools} key={entry.group.id} />
        ))}
      </div>
      <span className="subagent-flow__meta">{describeParentTools(data.toolCount, data.delegated)}</span>
      <div className="subagent-flow__actions">
        <button className="btn btn--secondary btn--sm" onClick={data.onEditTools}>
          Edit tools
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}

function SubagentFlowNode({ data }) {
  return (
    <div className="subagent-flow__child">
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <SubagentNode
        subagent={data.subagent}
        groups={data.groups}
        globalProvider={data.globalProvider}
        globalModel={data.globalModel}
        pendingDelete={data.pendingDelete}
        onEdit={data.actions.onEdit}
        onToggleEnabled={data.actions.onToggleEnabled}
        onRequestDelete={data.actions.onRequestDelete}
        onCancelDelete={data.actions.onCancelDelete}
        onDelete={data.actions.onDelete}
      />
    </div>
  )
}

const NODE_TYPES = { [PARENT_NODE]: ParentFlowNode, [SUBAGENT_NODE]: SubagentFlowNode }

function buildNodes({ subagents, toolGroups, mainAgentTools, globalProvider, globalModel, pendingDeleteId, actions }) {
  const { parent, children } = buildGraph(subagents, toolGroups, mainAgentTools)

  return [
    {
      id: PARENT_NODE,
      type: PARENT_NODE,
      position: { x: 0, y: 0 },
      draggable: false,
      data: { ...parent, globalProvider, globalModel, onEditTools: actions.onEditMainTools },
    },
    ...children.map(child => ({
      id: String(child.subagent.id),
      type: SUBAGENT_NODE,
      position: { x: 0, y: 0 },
      data: {
        subagent: child.subagent,
        groups: child.groups,
        globalProvider,
        globalModel,
        pendingDelete: pendingDeleteId === child.subagent.id,
        actions,
      },
    })),
  ]
}

function buildEdges(subagents) {
  return subagents.map(subagent => ({
    id: `parent-${subagent.id}`,
    source: PARENT_NODE,
    target: String(subagent.id),
    type: 'smoothstep',
    animated: !subagent.exclusive,
    markerEnd: EDGE_MARKER,
    style: subagent.exclusive ? EXCLUSIVE_EDGE_STYLE : SHARED_EDGE_STYLE,
  }))
}

function Flow({ subagents, toolGroups, mainAgentTools, globalProvider, globalModel, pendingDeleteId, actions }) {
  const fresh = useMemo(
    () => buildNodes({ subagents, toolGroups, mainAgentTools, globalProvider, globalModel, pendingDeleteId, actions }),
    [subagents, toolGroups, mainAgentTools, globalProvider, globalModel, pendingDeleteId, actions]
  )
  const edges = useMemo(() => buildEdges(subagents), [subagents])
  const [nodes, setNodes, onNodesChange] = useNodesState(fresh)
  const rendered = useMemo(() => mergeNodeData(nodes, fresh), [nodes, fresh])
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  const positioned = useRef(false)

  useEffect(() => {
    if (!initialized || positioned.current) return
    if (nodes.some(node => !node.measured)) return

    positioned.current = true
    setNodes(current => {
      const parent = current.find(node => node.id === PARENT_NODE)
      const children = current.filter(node => node.id !== PARENT_NODE)
      const positions = layoutPositions(
        parent.measured,
        children.map(child => child.measured)
      )
      const byId = new Map(children.map((child, index) => [child.id, positions.children[index]]))

      return current.map(node => ({ ...node, position: byId.get(node.id) ?? positions.parent }))
    })
    fitView(FIT_VIEW_OPTIONS)
  }, [initialized, nodes, setNodes, fitView])

  return (
    <ReactFlow
      nodes={rendered}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      zoomOnScroll={false}
      panOnScroll={false}
      preventScrolling={false}
      nodesConnectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      minZoom={0.4}
    >
      <Background variant="dots" gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export default function SubagentFlow({
  subagents,
  toolGroups,
  mainAgentTools,
  globalProvider,
  globalModel,
  pendingDeleteId,
  actions,
}) {
  return (
    <div className="subagent-flow">
      <ReactFlowProvider key={subagents.map(subagent => subagent.id).join('-')}>
        <Flow
          subagents={subagents}
          toolGroups={toolGroups}
          mainAgentTools={mainAgentTools}
          globalProvider={globalProvider}
          globalModel={globalModel}
          pendingDeleteId={pendingDeleteId}
          actions={actions}
        />
      </ReactFlowProvider>
    </div>
  )
}
