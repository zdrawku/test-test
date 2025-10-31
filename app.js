class AsanaGanttApp {
    constructor() {
        this.pat = null;
        this.workspaceGid = null;
        this.ganttInstance = null;
        
        // DOM elements
        this.patInput = document.getElementById('pat-input');
        this.connectBtn = document.getElementById('connect-btn');
        this.projectGroup = document.getElementById('project-group');
        this.projectSelect = document.getElementById('project-select');
        this.loadingDiv = document.getElementById('loading');
        this.errorDiv = document.getElementById('error-message');
        this.ganttContainer = document.getElementById('gantt-container');
        this.openMappingBtn = document.getElementById('open-mapping-btn');
        this.mappingDialog = document.getElementById('mapping-dialog');
        this.closeMappingBtn = document.getElementById('close-mapping-btn');
        this.saveMappingBtn = document.getElementById('save-mapping-btn');
        this.resetMappingBtn = document.getElementById('reset-mapping-btn');
        this.mappingRowsContainer = document.getElementById('mapping-rows');
        
        // Field mapping configuration
        this.initFieldMappings();
        this.loadFieldMappings();
        
        this.initEventListeners();
    }
    
    initEventListeners() {
        this.connectBtn.addEventListener('click', () => this.handleConnect());
        this.projectSelect.addEventListener('change', (e) => this.handleProjectChange(e.target.value));
        this.patInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleConnect();
        });
        
        // Mapping dialog events
        this.openMappingBtn.addEventListener('click', () => this.openMappingDialog());
        this.closeMappingBtn.addEventListener('click', () => this.closeMappingDialog());
        this.saveMappingBtn.addEventListener('click', () => this.saveFieldMappings());
        this.resetMappingBtn.addEventListener('click', () => this.resetFieldMappings());
        
        // Close dialog when clicking outside
        this.mappingDialog.addEventListener('click', (e) => {
            if (e.target === this.mappingDialog) {
                this.closeMappingDialog();
            }
        });
    }
    
    initFieldMappings() {
        // Define Asana fields based on the Swagger spec
        this.asanaFields = [
            { key: 'gid', type: 'string', description: 'Globally unique identifier of the task' },
            { key: 'name', type: 'string', description: 'Name of the task' },
            { key: 'start_on', type: 'date', description: 'The start date of the task (YYYY-MM-DD)' },
            { key: 'due_on', type: 'date', description: 'The due date of the task (YYYY-MM-DD)' },
            { key: 'due_at', type: 'datetime', description: 'The UTC date and time when task is due' },
            { key: 'completed', type: 'boolean', description: 'True if the task is marked complete' },
            { key: 'completed_percentage', type: 'number', description: 'Percentage completion (0-100)' },
            { key: 'completed_at', type: 'datetime', description: 'Time at which task was completed' },
            { key: 'parent', type: 'object', description: 'Parent task (contains gid)' },
            { key: 'parent.gid', type: 'string', description: 'Globally unique identifier of parent task' },
            { key: 'dependencies', type: 'array', description: 'Array of tasks this task depends on' },
            { key: 'dependents', type: 'array', description: 'Array of tasks that depend on this task' },
            { key: 'assignee', type: 'object', description: 'User this task is assigned to' },
            { key: 'assignee.name', type: 'string', description: 'Name of the assignee' },
            { key: 'notes', type: 'string', description: 'Free-form text notes for the task' },
            { key: 'created_at', type: 'datetime', description: 'Time at which task was created' },
            { key: 'modified_at', type: 'datetime', description: 'Time at which task was last modified' }
        ];
        
        // Define Gantt chart expected fields
        this.ganttFields = [
            { key: 'id', type: 'string', required: true, description: 'Unique identifier for the task' },
            { key: 'name', type: 'string', required: true, description: 'Display name of the task' },
            { key: 'startTime', type: 'date', required: true, description: 'Start date/time of the task' },
            { key: 'endTime', type: 'date', required: true, description: 'End date/time of the task' },
            { key: 'progress', type: 'number', required: false, description: 'Task completion progress (0-100)' },
            { key: 'parentId', type: 'string', required: false, description: 'ID of the parent task' },
            { key: 'dependencies', type: 'array', required: false, description: 'Array of task IDs this task depends on' }
        ];
        
        // Default mappings
        this.defaultMappings = {
            'id': 'gid',
            'name': 'name',
            'startTime': 'start_on',
            'endTime': 'due_on',
            'progress': 'completed_percentage',
            'parentId': 'parent.gid',
            'dependencies': 'dependencies'
        };
    }
    
    loadFieldMappings() {
        const saved = localStorage.getItem('asanaGanttFieldMappings');
        if (saved) {
            try {
                this.fieldMappings = JSON.parse(saved);
            } catch (e) {
                console.warn('Failed to load saved mappings, using defaults');
                this.fieldMappings = { ...this.defaultMappings };
            }
        } else {
            this.fieldMappings = { ...this.defaultMappings };
        }
    }
    
    openMappingDialog() {
        this.renderMappingDialog();
        this.mappingDialog.style.display = 'flex';
    }
    
    closeMappingDialog() {
        this.mappingDialog.style.display = 'none';
    }
    
    renderMappingDialog() {
        this.mappingRowsContainer.innerHTML = '';
        
        this.ganttFields.forEach(ganttField => {
            const row = document.createElement('div');
            row.className = 'mapping-row';
            
            // Gantt field info (left side)
            const ganttInfo = document.createElement('div');
            ganttInfo.className = 'field-info';
            ganttInfo.innerHTML = `
                <div class="field-label">
                    ${ganttField.key}
                    ${ganttField.required ? '<span style="color: #e74c3c;">*</span>' : ''}
                </div>
                <div class="field-type">${ganttField.type}</div>
                <div class="field-description">${ganttField.description}</div>
            `;
            
            // Arrow
            const arrow = document.createElement('div');
            arrow.className = 'mapping-arrow';
            arrow.innerHTML = '←';
            
            // Asana field selector (right side)
            const asanaSelector = document.createElement('div');
            asanaSelector.className = 'field-info';
            
            const select = document.createElement('select');
            select.className = 'field-select';
            select.dataset.ganttField = ganttField.key;
            
            // Add empty option
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Select Asana field --';
            select.appendChild(emptyOption);
            
            // Add Asana fields as options
            this.asanaFields.forEach(asanaField => {
                const option = document.createElement('option');
                option.value = asanaField.key;
                option.textContent = `${asanaField.key} (${asanaField.type})`;
                
                // Set selected if this is the current mapping
                if (this.fieldMappings[ganttField.key] === asanaField.key) {
                    option.selected = true;
                }
                
                select.appendChild(option);
            });
            
            // Show selected field description
            const selectedDescription = document.createElement('div');
            selectedDescription.className = 'field-description';
            selectedDescription.style.marginTop = '8px';
            
            const updateDescription = () => {
                const selectedField = this.asanaFields.find(f => f.key === select.value);
                selectedDescription.textContent = selectedField ? selectedField.description : '';
            };
            
            select.addEventListener('change', updateDescription);
            updateDescription();
            
            asanaSelector.appendChild(select);
            asanaSelector.appendChild(selectedDescription);
            
            row.appendChild(ganttInfo);
            row.appendChild(arrow);
            row.appendChild(asanaSelector);
            
            this.mappingRowsContainer.appendChild(row);
        });
    }
    
    saveFieldMappings() {
        const selects = this.mappingRowsContainer.querySelectorAll('.field-select');
        const newMappings = {};
        
        selects.forEach(select => {
            const ganttField = select.dataset.ganttField;
            const asanaField = select.value;
            if (asanaField) {
                newMappings[ganttField] = asanaField;
            }
        });
        
        this.fieldMappings = newMappings;
        localStorage.setItem('asanaGanttFieldMappings', JSON.stringify(newMappings));
        
        this.closeMappingDialog();
        
        // Show success message
        this.showError('Field mappings saved successfully! Changes will apply to newly loaded projects.');
        setTimeout(() => {
            this.hideError();
        }, 3000);
    }
    
    resetFieldMappings() {
        if (confirm('Are you sure you want to reset all field mappings to defaults?')) {
            this.fieldMappings = { ...this.defaultMappings };
            localStorage.removeItem('asanaGanttFieldMappings');
            this.renderMappingDialog();
            
            // Show success message
            this.showError('Field mappings reset to defaults!');
            setTimeout(() => {
                this.hideError();
            }, 2000);
        }
    }
    
    showLoading(show = true) {
        this.loadingDiv.style.display = show ? 'flex' : 'none';
    }
    
    showError(message) {
        this.errorDiv.textContent = message;
        this.errorDiv.style.display = 'block';
        setTimeout(() => {
            this.errorDiv.style.display = 'none';
        }, 5000);
    }
    
    hideError() {
        this.errorDiv.style.display = 'none';
    }
    
    async makeAsanaRequest(endpoint, params = {}) {
        const url = new URL(`https://app.asana.com/api/1.0${endpoint}`);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.pat}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.errors?.[0]?.message || `API Error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.data;
    }
    
    async handleConnect() {
        const pat = this.patInput.value.trim();
        
        if (!pat) {
            this.showError('Please enter your Asana PAT');
            return;
        }
        
        this.pat = pat;
        this.hideError();
        this.showLoading();
        
        try {
            // Get workspaces
            const workspaces = await this.makeAsanaRequest('/workspaces');
            
            if (!workspaces || workspaces.length === 0) {
                throw new Error('No workspaces found');
            }
            
            // Use the first workspace
            this.workspaceGid = workspaces[0].gid;
            
            // Fetch projects
            await this.loadProjects();
            
            // Show project selector
            this.projectGroup.style.display = 'block';
            this.projectSelect.disabled = false;
            this.connectBtn.textContent = 'Connected ✓';
            this.connectBtn.disabled = true;
            this.patInput.disabled = true;
            
        } catch (error) {
            console.error('Connection error:', error);
            this.showError(`Failed to connect: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadProjects() {
        try {
            const projects = await this.makeAsanaRequest('/projects', {
                workspace: this.workspaceGid
            });
            
            // Clear existing options except the first one
            this.projectSelect.innerHTML = '<option value="">-- Select a project --</option>';
            
            // Add projects to select
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.gid;
                option.textContent = project.name;
                this.projectSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Error loading projects:', error);
            this.showError(`Failed to load projects: ${error.message}`);
        }
    }
    
    async handleProjectChange(projectGid) {
        if (!projectGid) {
            this.clearGantt();
            return;
        }
        
        this.hideError();
        this.showLoading();
        
        try {
            // Fetch all tasks for the project
            const tasks = await this.fetchProjectTasks(projectGid);
            
            if (!tasks || tasks.length === 0) {
                this.showError('No tasks found in this project');
                this.clearGantt();
                return;
            }
            
            // Fetch detailed information for each task
            const detailedTasks = await this.fetchTaskDetails(tasks);
            
            // Convert to Gantt format
            const ganttData = this.convertToGanttFormat(detailedTasks);
            
            if (ganttData.length === 0) {
                this.showError('No tasks with dates found in this project');
                this.clearGantt();
                return;
            }
            
            // Render Gantt chart
            this.renderGantt(ganttData);
            
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.showError(`Failed to load tasks: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }
    
    async fetchProjectTasks(projectGid) {
        return await this.makeAsanaRequest(`/projects/${projectGid}/tasks`, {
            opt_fields: 'name,completed,start_on,due_on,assignee,notes'
        });
    }
    
    async fetchTaskDetails(tasks) {
        const detailedTasks = [];
        
        for (const task of tasks) {
            try {
                const details = await this.makeAsanaRequest(`/tasks/${task.gid}`, {
                    opt_fields: 'name,completed,start_on,due_on,parent,dependencies,dependents,completed_percentage,subtasks'
                });
                
                // Fetch subtasks if they exist
                if (details.subtasks && details.subtasks.length > 0) {
                    details.subtasksDetails = await this.fetchTaskDetails(details.subtasks);
                }
                
                detailedTasks.push(details);
            } catch (error) {
                console.warn(`Failed to fetch details for task ${task.gid}:`, error);
            }
        }
        
        return detailedTasks;
    }
    
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    
    convertToGanttFormat(tasks) {
        const ganttSeries = [];
        const taskMap = new Map();
        
        const processTask = (task, parentId = null) => {
            // Get mapped ID field
            const idField = this.fieldMappings['id'] || 'gid';
            const taskId = this.getNestedValue(task, idField);
            
            // avoid processing same task twice
            if (taskMap.has(taskId)) return;
            
            // Determine parent from parameter or Asana parent field
            const parentField = this.fieldMappings['parentId'] || 'parent.gid';
            const parentGid = parentId || this.getNestedValue(task, parentField) || null;
            
            // Get start and end date fields
            const startField = this.fieldMappings['startTime'] || 'start_on';
            const endField = this.fieldMappings['endTime'] || 'due_on';
            const startValue = this.getNestedValue(task, startField);
            const endValue = this.getNestedValue(task, endField);
            
            // Skip tasks without dates
            if (!startValue && !endValue) {
                // still record mapping so children can reference parent even if parent has no dates
                if (parentGid && !taskMap.has(taskId)) {
                    taskMap.set(taskId, null);
                }
                // but do not add to ganttSeries
            } else {
                const nameField = this.fieldMappings['name'] || 'name';
                const progressField = this.fieldMappings['progress'] || 'completed_percentage';
                
                const ganttTask = {
                    id: taskId,
                    name: this.getNestedValue(task, nameField) || 'Untitled Task',
                    startTime: this.formatDate(startValue || endValue),
                    endTime: this.formatDate(endValue || startValue),
                    progress: task.completed ? 100 : (this.getNestedValue(task, progressField) || 0)
                };
                
                // Attach parentId when known
                if (parentGid) {
                    ganttTask.parentId = parentGid;
                    // also expose as dependencies for Gantt libs that use that field
                    ganttTask.dependencies = [parentGid];
                }
                
                ganttSeries.push(ganttTask);
                taskMap.set(taskId, ganttTask);
            }
            
            // Process subtasks (if any) and ensure their parent is set to current task ID
            if (task.subtasksDetails && task.subtasksDetails.length > 0) {
                task.subtasksDetails.forEach(subtask => {
                    processTask(subtask, taskId);
                });
            }
        };
        
        // Process all tasks (not only top-level) so parent relationships from Asana are preserved
        tasks.forEach(task => processTask(task));
        console.log('Gantt series with custom mappings:', ganttSeries);
        console.log('Active field mappings:', this.fieldMappings);
        return ganttSeries;
    }
    
    formatDate(dateString) {
        if (!dateString) return null;
        
        // Convert from YYYY-MM-DD to MM-DD-YYYY
        const [year, month, day] = dateString.split('-');
        return `${month}-${day}-${year}`;
    }
    
    renderGantt(data) {
        this.clearGantt();
        
        const ganttOptions = {
            series: data,
            chart: {
                height: Math.max(400, data.length * 50)
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: '60%'
                }
            },
            xaxis: {
                type: 'datetime'
            }
        };
        
        this.ganttInstance = new ApexGantt(this.ganttContainer, ganttOptions);
        this.ganttInstance.render();
        this.ganttContainer.style.display = 'block';
    }
    
    clearGantt() {
        if (this.ganttInstance) {
            this.ganttInstance.destroy();
            this.ganttInstance = null;
        }
        this.ganttContainer.innerHTML = '';
        this.ganttContainer.style.display = 'none';
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AsanaGanttApp();
});