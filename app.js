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
        
        this.initEventListeners();
    }
    
    initEventListeners() {
        this.connectBtn.addEventListener('click', () => this.handleConnect());
        this.projectSelect.addEventListener('change', (e) => this.handleProjectChange(e.target.value));
        this.patInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleConnect();
        });
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
    
    convertToGanttFormat(tasks) {
        const ganttSeries = [];
        const taskMap = new Map();
        
        const processTask = (task, parentId = null) => {
            // avoid processing same task twice
            if (taskMap.has(task.gid)) return;
            
            // Determine parent from parameter or Asana parent field
            const parentGid = parentId || (task.parent && task.parent.gid) || null;
            
            // Skip tasks without dates
            if (!task.start_on && !task.due_on) {
                // still record mapping so children can reference parent even if parent has no dates
                if (parentGid && !taskMap.has(task.gid)) {
                    taskMap.set(task.gid, null);
                }
                // but do not add to ganttSeries
            } else {
                const ganttTask = {
                    id: task.gid,
                    name: task.name || 'Untitled Task',
                    startTime: this.formatDate(task.start_on || task.due_on),
                    endTime: this.formatDate(task.due_on || task.start_on),
                    progress: task.completed ? 100 : (task.completed_percentage || 0)
                };
                
                // Attach parentId when known
                if (parentGid) {
                    ganttTask.parentId = parentGid;
                    // also expose as dependencies for Gantt libs that use that field
                    ganttTask.dependencies = [parentGid];
                }
                
                ganttSeries.push(ganttTask);
                taskMap.set(task.gid, ganttTask);
            }
            
            // Process subtasks (if any) and ensure their parent is set to current task.gid
            if (task.subtasksDetails && task.subtasksDetails.length > 0) {
                task.subtasksDetails.forEach(subtask => {
                    processTask(subtask, task.gid);
                });
            }
        };
        
        // Process all tasks (not only top-level) so parent relationships from Asana are preserved
        tasks.forEach(task => processTask(task));
        console.log(ganttSeries);
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